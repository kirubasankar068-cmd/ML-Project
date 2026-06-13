"""
Script to train and save a fresh LightGBM model compatible with Python 3.14
using synthetic bug priority data.
"""
import pickle
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score, f1_score

try:
    import lightgbm as lgb
    print(f"LightGBM version: {lgb.__version__}")
except ImportError:
    print("LightGBM not installed!")
    exit(1)

# ============================================================
# Generate synthetic bug report training data
# ============================================================
np.random.seed(42)
n_samples = 2000

# Feature vectors
title_length = np.random.randint(10, 200, n_samples)
title_word_count = np.random.randint(2, 30, n_samples)
desc_length = np.random.randint(20, 2000, n_samples)
desc_word_count = np.random.randint(5, 300, n_samples)
affected_users = np.random.randint(1, 10000, n_samples)
is_reproducible = np.random.randint(0, 2, n_samples)
report_day_of_week = np.random.randint(0, 7, n_samples)
report_month = np.random.randint(1, 13, n_samples)
severity_encoded = np.random.randint(1, 5, n_samples)  # 1=low, 2=medium, 3=high, 4=critical

# Create a rule-based label with some noise
def rule_based_priority(severity, users, reproducible, desc_len):
    if severity == 4 or users > 5000:
        return 3  # Critical
    elif severity == 3 or users > 1000:
        return 2  # High  
    elif severity == 2 or users > 100 or desc_len > 500:
        return 1  # Medium
    else:
        return 0  # Low

labels = np.array([
    rule_based_priority(s, u, r, d)
    for s, u, r, d in zip(severity_encoded, affected_users, is_reproducible, desc_length)
])

# Add some noise
noise_mask = np.random.random(n_samples) < 0.1
labels[noise_mask] = np.random.randint(0, 4, noise_mask.sum())

# Build DataFrame
df = pd.DataFrame({
    'title_length': title_length,
    'title_word_count': title_word_count,
    'desc_length': desc_length,
    'desc_word_count': desc_word_count,
    'affected_users': affected_users,
    'is_reproducible': is_reproducible,
    'report_day_of_week': report_day_of_week,
    'report_month': report_month,
    'severity_encoded': severity_encoded,
})

X = df
y = labels

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

print(f"Training set: {X_train.shape}, Test set: {X_test.shape}")
print(f"Label distribution: {pd.Series(y_train).value_counts().to_dict()}")

# ============================================================
# Train LightGBM Model
# ============================================================
print("\nTraining LightGBM model...")

model = lgb.LGBMClassifier(
    n_estimators=200,
    num_leaves=31,
    learning_rate=0.05,
    feature_fraction=0.8,
    bagging_fraction=0.8,
    bagging_freq=5,
    random_state=42,
    verbose=-1,
    n_jobs=-1
)

model.fit(
    X_train, y_train,
    eval_set=[(X_test, y_test)],
)

# Evaluate
y_pred = model.predict(X_test)
acc = accuracy_score(y_test, y_pred)
f1 = f1_score(y_test, y_pred, average='weighted')
print(f"Accuracy: {acc:.4f}")
print(f"F1-Score: {f1:.4f}")

# ============================================================
# Save model
# ============================================================
import os
script_dir = os.path.dirname(os.path.abspath(__file__))
model_path = os.path.abspath(os.path.join(script_dir, "..", "app", "models", "optimized_lightgbm_model.pkl"))
with open(model_path, "wb") as f:
    pickle.dump(model, f, protocol=4)  # Protocol 4 for broader compatibility
print(f"\nModel saved to {model_path}")

# Verify it loads correctly
with open(model_path, "rb") as f:
    loaded = pickle.load(f)
test_pred = loaded.predict(X_test[:5])
print(f"Verification prediction: {test_pred}")
print("Model successfully saved and verified!")
