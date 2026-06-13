import sys, os
sys.path.insert(0, '.')

import pandas as pd
from backend.app.services.feature_engineering import FeatureEngineer

raw_path = 'backend/ml_pipeline/data/raw/all_departments_bugs_50k.csv'
print(f"Loading dataset from {raw_path}...")
df = pd.read_csv(raw_path)
print(f"Dataset loaded: {len(df)} rows, columns: {df.columns.tolist()}")

df = df.dropna(subset=['priority'])
for col in df.select_dtypes(include=['object']).columns:
    df[col] = df[col].fillna('Unknown')
for col in df.select_dtypes(include=['int64','float64']).columns:
    df[col] = df[col].fillna(df[col].median())

print("Fitting FeatureEngineer...")
fe = FeatureEngineer()
fe.fit(df)
print(f"Fitted OK. is_fitted={fe.is_fitted}, features={len(fe.get_feature_names())}")

out_path = 'backend/app/models/feature_engineer.pkl'
fe.save(out_path)
print(f"Saved to {out_path}")
print("DONE")
