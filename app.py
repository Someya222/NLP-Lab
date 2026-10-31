import json
import os
import random
import re
from collections import Counter
from math import log

import nltk
import numpy as np
from flask import Flask, jsonify, render_template, request

# NLTK resources (downloaded once, needs internet the first time)
for pkg in ["punkt", "punkt_tab", "stopwords", "wordnet", "omw-1.4",
            "averaged_perceptron_tagger", "averaged_perceptron_tagger_eng",
            "maxent_ne_chunker", "maxent_ne_chunker_tab", "words", "vader_lexicon"]:
    try:
        nltk.download(pkg, quiet=True)
    except Exception:
        pass

from nltk import ne_chunk, pos_tag
from nltk.corpus import stopwords
from nltk.stem import PorterStemmer, WordNetLemmatizer
from nltk.sentiment.vader import SentimentIntensityAnalyzer
from nltk.tokenize import word_tokenize
from tensorflow.keras.models import load_model

DATA = "data"          # put the files from nlp_lab_files.zip in this folder
app = Flask(__name__)


def jl(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


meta = jl("meta.json")
vocab = jl("vocab.json")
galaxy = jl("galaxy.json")
samples = jl("samples.json")
E = np.load(os.path.join(DATA, "embeddings.npy"))
model = load_model(os.path.join(DATA, "sentiment_model.h5"), compile=False)

MAXLEN = meta["max_len"]
TOKEN_RE = re.compile(meta["token_regex"])
W2I = {w: i for i, w in enumerate(vocab)}
EN = E / (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
VALID = np.array([w.isalpha() and len(w) >= 3 for w in vocab])

# galaxy lookup
G_IDX = {w: i for i, w in enumerate(galaxy["words"])}
GV = EN[[W2I[w] for w in galaxy["words"]]]

# optional GloVe (for analogies)
GLOVE = None
if os.path.exists(os.path.join(DATA, "glove_vectors.npy")):
    gv = np.load(os.path.join(DATA, "glove_vectors.npy"))
    gw = jl("glove_words.json")
    GLOVE = {"words": gw, "idx": {w: i for i, w in enumerate(gw)},
             "vec": gv / (np.linalg.norm(gv, axis=1, keepdims=True) + 1e-9)}

STOP = set(stopwords.words("english"))
STEM = PorterStemmer()
LEM = WordNetLemmatizer()
VADER = SentimentIntensityAnalyzer()

# Text typed without apostrophes ("didnt") would be an unknown word for the model,
# so it is turned back into the form seen during training ("didn't").
CONTRACTIONS = {"didnt": "didn't", "dont": "don't", "doesnt": "doesn't", "cant": "can't", "wont": "won't",
                "isnt": "isn't", "wasnt": "wasn't", "arent": "aren't", "werent": "weren't",
                "couldnt": "couldn't", "wouldnt": "wouldn't", "shouldnt": "shouldn't",
                "havent": "haven't", "hasnt": "hasn't", "hadnt": "hadn't", "aint": "ain't",
                "im": "i'm", "ive": "i've", "youre": "you're", "thats": "that's",
                "theres": "there's", "hes": "he's", "shes": "she's"}


def normalize(text):
    text = text.replace("’", "'").replace("`", "'")
    return re.sub(r"[A-Za-z]+", lambda m: CONTRACTIONS.get(m.group(0).lower(), m.group(0)), text)

# document frequencies from the sample sentences (for a small TF-IDF)
DF = Counter()
for s in samples:
    DF.update(set(TOKEN_RE.findall(s["text"].lower())))
N_DOCS = len(samples)


def wn_pos(tag):
    return {"J": "a", "V": "v", "N": "n", "R": "r"}.get(tag[0], "n")


def encode(token_lists):
    out = np.zeros((len(token_lists), MAXLEN), dtype="int32")
    for r, toks in enumerate(token_lists):
        ids = [W2I.get(w, 1) for w in toks][:MAXLEN]
        out[r, :len(ids)] = ids
    return out


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/info")
def info():
    return jsonify({"glove": GLOVE is not None, "accuracy": meta.get("test_accuracy")})


@app.route("/api/sample")
def sample():
    return jsonify(random.choice(samples))


@app.route("/api/galaxy")
def get_galaxy():
    return jsonify(galaxy)


@app.route("/api/process", methods=["POST"])
def process():
    text = ((request.get_json() or {}).get("text") or "").strip()[:300]
    if not text:
        return jsonify({"error": "empty"}), 400
    tokens = word_tokenize(text)
    tagged = pos_tag(tokens)

    ents = {}
    try:
        idx = 0
        for node in ne_chunk(tagged):
            if hasattr(node, "label"):
                for k in range(len(node)):
                    ents[idx + k] = node.label()
                idx += len(node)
            else:
                idx += 1
    except Exception:
        pass

    rows = []
    for i, (tok, tag) in enumerate(tagged):
        low = tok.lower()
        if not re.search(r"[A-Za-z0-9]", tok):
            kind = "punct"
        elif low in STOP:
            kind = "stop"
        else:
            kind = "keep"
        rows.append({"tok": tok, "kind": kind, "tag": tag, "stem": STEM.stem(low),
                     "lemma": LEM.lemmatize(low, wn_pos(tag)), "ent": ents.get(i)})

    kept = [r for r in rows if r["kind"] == "keep"]
    counts = Counter(r["lemma"] for r in kept)
    total = max(len(kept), 1)
    keywords = []
    for lemma, c in counts.items():
        idf = log((1 + N_DOCS) / (1 + DF.get(lemma, 0))) + 1
        keywords.append({"word": lemma, "count": c, "tfidf": round(c / total * idf, 4)})
    keywords.sort(key=lambda k: -k["tfidf"])

    pts = []
    for r in kept:
        for w in (r["tok"].lower(), r["lemma"]):
            if w in G_IDX and w not in pts:
                pts.append(w)
                break

    mtoks = TOKEN_RE.findall(normalize(text).lower())[:MAXLEN]
    probs, importance = [], []
    if mtoks:
        p = model.predict(encode([mtoks[:k] for k in range(1, len(mtoks) + 1)]), verbose=0)[:, 0]
        probs = [round(float(v), 4) for v in p]
        # Attention-style word importance by occlusion:
        # remove each word in turn and see how much the final score changes.
        full = float(p[-1])
        if len(mtoks) > 1:
            occl = model.predict(encode([mtoks[:i] + mtoks[i + 1:] for i in range(len(mtoks))]),
                                 verbose=0)[:, 0]
            importance = [round(full - float(v), 4) for v in occl]
        else:
            importance = [round(full - 0.5, 4)]

    # Hybrid sentiment = BiLSTM + VADER lexicon. The lexicon handles short text and
    # negation well, so it gets more weight for very short inputs.
    p_lstm = probs[-1] if probs else 0.5
    compound = VADER.polarity_scores(normalize(text))["compound"]          # -1 .. +1
    p_vader = 0.5 + 0.5 * float(np.tanh(2 * compound))                     # sharpened to 0 .. 1
    w_v = 0.0 if abs(compound) < 0.05 else (0.5 if len(mtoks) <= 8 else 0.25)
    combined = (1 - w_v) * p_lstm + w_v * p_vader
    sentiment = {"lstm": round(p_lstm, 4), "vader": round(compound, 3), "combined": round(combined, 4)}

    return jsonify({"rows": rows, "keywords": keywords, "points": pts,
                    "meter": {"tokens": mtoks, "probs": probs}, "importance": importance,
                    "sentiment": sentiment})


@app.route("/api/neighbors")
def neighbors():
    w = request.args.get("word", "").lower()
    if w not in W2I:
        return jsonify([])
    sims = EN @ EN[W2I[w]]
    sims[~VALID] = -1
    sims[W2I[w]] = -1
    top = np.argsort(sims)[::-1][:8]
    return jsonify([{"word": vocab[i], "sim": round(float(sims[i]), 3)} for i in top])


@app.route("/api/odd")
def odd():
    for _ in range(100):
        s = random.randrange(len(GV))
        sims = GV @ GV[s]
        order = np.argsort(sims)[::-1]
        group = [int(s)] + [int(i) for i in order[1:3]]
        far = [int(i) for i in np.where(sims < 0.1)[0]]
        if len(far) < 5 or sims[order[2]] < 0.45:
            continue
        out = random.choice(far)
        idxs = group + [out]
        random.shuffle(idxs)
        sub = GV[idxs]
        m = sub @ sub.T
        np.fill_diagonal(m, 0)
        ai = int(np.argmin(m.sum(axis=1)))
        return jsonify({"words": [galaxy["words"][i] for i in idxs],
                        "answer": idxs.index(out), "ai": ai})
    return jsonify({"error": "retry"}), 500


@app.route("/api/analogy")
def analogy():
    if GLOVE is None:
        return jsonify([])
    pos = [w for w in request.args.get("pos", "").split(",") if w in GLOVE["idx"]]
    neg = [w for w in request.args.get("neg", "").split(",") if w in GLOVE["idx"]]
    v = sum(GLOVE["vec"][GLOVE["idx"][w]] for w in pos) - sum(GLOVE["vec"][GLOVE["idx"][w]] for w in neg)
    sims = GLOVE["vec"] @ (v / (np.linalg.norm(v) + 1e-9))
    for w in pos + neg:
        sims[GLOVE["idx"][w]] = -1
    top = np.argsort(sims)[::-1][:3]
    return jsonify([{"word": GLOVE["words"][i], "sim": round(float(sims[i]), 3)} for i in top])


if __name__ == "__main__":
    app.run(debug=False)