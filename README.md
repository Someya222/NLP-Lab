# NLP Lab - Journey of a Sentence

An interactive NLP project: a sentence travels through the NLP pipeline (tokenization, stop words, stemming/lemmatization,
POS/NER, TF-IDF), lands on a Word2Vec "galaxy" map and is read word by word by a BiLSTM sentiment model.
Includes an "Odd One Out" word-embedding game.

## Folder structure

```
nlp-lab/
├── app.py
├── requirements.txt
├── data/                  <- unzip nlp_lab_files.zip here
│   ├── sentiment_model.h5
│   ├── embeddings.npy, vocab.json, galaxy.json, samples.json, meta.json
│   └── glove_vectors.npy, glove_words.json   (optional)
└── templates/
    └── index.html
```

## Run

1. Unzip `nlp_lab_files.zip` into the `data/` folder.
2. `pip install -r requirements.txt`
3. `python app.py` (first run downloads NLTK data, needs internet)
4. Open http://127.0.0.1:5000

## Tabs

- **Factory:** press *New Sentence*, then *Next Stage* (or Auto-play) to watch the 7 stages.
- **Galaxy:** hover/click words on the Word2Vec map, drag to pan, scroll to zoom, toggle sentiment colours, try GloVe analogies.
- **Odd One Out:** tap the word that does not belong; the AI answers using word embeddings.

## Syllabus mapping

- NLP: tokenization, stop words, stemming, lemmatization, POS, NER, BoW, TF-IDF, Word2Vec/GloVe, LSTM sentiment analysis (Experiments 1-5, 7)
- Deep Learning Unit 3: RNN/LSTM/BiLSTM, word embeddings, GloVe
