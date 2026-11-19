"""
Extended Model Retraining Script for Smart Bug Analyzer
Trains/extends LightGBM classifier for bug category and priority prediction.

Dataset Format (.csv or .xlsx):
Columns required:
- summary / title: Bug title or text summary
- description: Detailed error description / log trace
- component: Affected system component (e.g. Auth, Database, UI, Network)
- severity: Reported severity (critical, high, medium, low)
- category: Target category (Syntax, Runtime, Logic, Performance, Security, UI/UX, Database, Network, Configuration, Dependency)
- priority: Target priority (P1, P2, P3, P4 or Critical, High, Medium, Low)
"""

import os
import argparse
import logging
import pandas as pd
import numpy as np
import pickle

from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, accuracy_score

try:
    import lightgbm as lgb
    HAS_LIGHTGBM = True
except ImportError:
    HAS_LIGHTGBM = False
    from sklearn.ensemble import RandomForestClassifier

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("train_extended_classifier")

def train_extended_model(data_path: str, output_dir: str):
    logger.info(f"Loading training dataset from {data_path}...")
    if data_path.endswith('.csv'):
        df = pd.read_csv(data_path)
    elif data_path.endswith(('.xlsx', '.xls')):
        df = pd.read_excel(data_path)
    else:
        raise ValueError("Unsupported format. Use .csv or .xlsx")

    logger.info(f"Dataset loaded successfully: {len(df)} rows.")

    # Standardize column names
    cols = {c.lower(): c for c in df.columns}
    title_col = cols.get('title') or cols.get('summary') or 'summary'
    desc_col = cols.get('description') or 'description'
    cat_col = cols.get('category') or 'category'
    prio_col = cols.get('priority') or 'priority'

    df['combined_text'] = df[title_col].fillna('') + " " + df[desc_col].fillna('')

    # Text Vectorization
    vectorizer = TfidfVectorizer(max_features=1000, stop_words='english', ngram_range=(1, 2))
    X_text = vectorizer.fit_transform(df['combined_text']).toarray()

    # Target Encoders
    prio_encoder = LabelEncoder()
    y_prio = prio_encoder.fit_transform(df[prio_col].astype(str))

    X_train, X_test, y_train, y_test = train_test_split(X_text, y_prio, test_size=0.2, random_state=42)

    logger.info("Training extended classification model...")
    if HAS_LIGHTGBM:
        model = lgb.LGBMClassifier(n_estimators=200, learning_rate=0.05, random_state=42, verbose=-1)
    else:
        model = RandomForestClassifier(n_estimators=200, random_state=42)

    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    logger.info(f"Model Training Accuracy: {acc * 100:.2f}%")
    logger.info("\n" + classification_report(y_test, y_pred, target_names=[str(c) for c in prio_encoder.classes_]))

    os.makedirs(output_dir, exist_ok=True)
    model_file = os.path.join(output_dir, "extended_bug_classifier.pkl")
    vec_file = os.path.join(output_dir, "extended_vectorizer.pkl")
    enc_file = os.path.join(output_dir, "extended_priority_encoder.pkl")

    with open(model_file, "wb") as f:
        pickle.dump(model, f)
    with open(vec_file, "wb") as f:
        pickle.dump(vectorizer, f)
    with open(enc_file, "wb") as f:
        pickle.dump(prio_encoder, f)

    logger.info(f"Extended model artifacts saved successfully to {output_dir}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train extended model for Smart Bug Analyzer")
    parser.add_argument("--data", type=str, required=True, help="Path to training dataset (.csv / .xlsx)")
    parser.add_argument("--out", type=str, default="backend/app/models", help="Output directory for model artifacts")
    args = parser.parse_args()

    train_extended_model(args.data, args.out)
