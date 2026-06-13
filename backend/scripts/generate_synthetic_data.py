import os
import random
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Core components and details for synthetic data generation
COMPONENTS = ['authentication', 'database', 'UI', 'payment', 'search', 'notifications', 'analytics', 'cart', 'settings']
SEVERITIES = ['low', 'medium', 'high', 'critical']
REPORTERS = ['alice@example.com', 'bob@example.com', 'charlie@example.com', 'david@example.com', 'eve@example.com']

BUG_TEMPLATES = [
    {
        "title": "Login failure due to invalid token",
        "description": "Users are unable to log in because the system throws a token invalid error on correct credentials. This blocking error prevents account access.",
        "component": "authentication"
    },
    {
        "title": "Database connection timeout during checkout",
        "description": "The checkout page times out with a 504 gateway error when trying to write order data to the database under heavy load.",
        "component": "database"
    },
    {
        "title": "Checkout button misaligned on mobile screens",
        "description": "The checkout button is partially cut off on smaller mobile viewports (iOS Safari and Android Chrome), making it hard to tap.",
        "component": "UI"
    },
    {
        "title": "Payment gateway throws 500 Internal Error",
        "description": "Credit card processing fails with a 500 error. The logs indicate a signature mismatch error with the payment service provider.",
        "component": "payment"
    },
    {
        "title": "Search results are extremely slow to load",
        "description": "Queries on the catalog search take upwards of 8 seconds to return results, causing a bad user experience.",
        "component": "search"
    },
    {
        "title": "Push notifications not arriving on Android",
        "description": "Android users report that they are not receiving transaction alert notifications, while iOS notifications are working perfectly.",
        "component": "notifications"
    },
    {
        "title": "Dashboard chart displays NaN values",
        "description": "The revenue analytics dashboard chart shows NaN for the weekly total when there are no transactions on a specific day.",
        "component": "analytics"
    },
    {
        "title": "Items disappear from cart after page reload",
        "description": "When a guest user adds items to their shopping cart and refreshes the page, the cart resets to empty.",
        "component": "cart"
    },
    {
        "title": "Password reset email link is broken",
        "description": "The link inside the password reset confirmation email redirects users to a 404 page instead of the reset form.",
        "component": "settings"
    }
]

def generate_bug_dataset(n_samples=5000):
    """Generates synthetic bug priority dataset"""
    logger.info(f"Generating {n_samples} synthetic bug reports...")
    
    data = []
    start_date = datetime.now() - timedelta(days=180)
    
    for i in range(1, n_samples + 1):
        template = random.choice(BUG_TEMPLATES)
        
        # Add slight variations to title and description
        title = f"{template['title']} (Ref: {random.randint(100, 999)})"
        description = f"{template['description']} Steps to reproduce: open app, navigate to {template['component']}, click trigger."
        
        component = template['component']
        severity = random.choice(SEVERITIES)
        affected_users = random.randint(1, 1000)
        is_reproducible = random.choice([True, True, False])  # 2/3 chance True
        reported_by = random.choice(REPORTERS)
        reported_date = (start_date + timedelta(days=random.randint(0, 180))).strftime("%Y-%m-%d %H:%M:%S")
        
        # Determine priority logically with some noise
        # severity: low=1, medium=2, high=3, critical=4
        sev_score = SEVERITIES.index(severity) + 1
        
        priority_score = (
            sev_score * 2.0 + 
            np.log1p(affected_users) * 0.5 + 
            (1.5 if is_reproducible else 0.0) +
            random.uniform(-1, 1)
        )
        
        if priority_score >= 8.5:
            priority = 'Critical'
        elif priority_score >= 6.5:
            priority = 'High'
        elif priority_score >= 4.0:
            priority = 'Medium'
        else:
            priority = 'Low'
            
        data.append({
            'id': i,
            'title': title,
            'description': description,
            'component': component,
            'severity': severity,
            'affected_users': affected_users,
            'is_reproducible': is_reproducible,
            'priority': priority,
            'reported_date': reported_date,
            'reported_by': reported_by
        })
        
    return pd.DataFrame(data)

def main():
    # Make directories
    os.makedirs('data/raw', exist_ok=True)
    os.makedirs('data/processed', exist_ok=True)
    os.makedirs('data/validation_reports', exist_ok=True)
    
    # Generate data
    df = generate_bug_dataset(n_samples=5000)
    df.to_csv('data/raw/all_departments_bugs_50k.csv', index=False)
    logger.info("Saved dataset to data/raw/all_departments_bugs_50k.csv")
    
    # Preprocess & Fit Feature Engineer
    logger.info("Fitting FeatureEngineer...")
    from src.features import FeatureEngineer
    
    fe = FeatureEngineer()
    X = fe.fit_transform(df)
    fe.save('feature_engineer.pkl')
    logger.info("Saved feature_engineer.pkl")
    
    # Prepare target variable
    priority_map = {'Low': 0, 'Medium': 1, 'High': 2, 'Critical': 3}
    y = df['priority'].map(priority_map)
    
    # Train Model
    logger.info("Training ModelTrainer...")
    from src.train import ModelTrainer
    
    trainer = ModelTrainer()
    results = trainer.train(X, y, test_size=0.2)
    logger.info(f"Model trained successfully. Accuracy: {results['metrics']['accuracy']:.4f}")
    
    # Save model under both names for compatibility with api & dashboard
    trainer.save('optimized_xgboost_model.pkl')
    trainer.save('optimized_lightgbm_model.pkl')
    logger.info("Saved optimized_xgboost_model.pkl and optimized_lightgbm_model.pkl")

if __name__ == '__main__':
    main()
