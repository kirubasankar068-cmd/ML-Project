"""
Apache Airflow DAG for Model Retraining Pipeline
"""

from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
import logging

logger = logging.getLogger(__name__)

# Default arguments for the DAG
default_args = {
    'owner': 'ml-team',
    'depends_on_past': False,
    'start_date': datetime(2026, 1, 1),
    'email': ['ml-alerts@example.com'],
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 2,
    'retry_delay': timedelta(minutes=5),
}

# Define DAG
dag = DAG(
    'bug_priority_predictor_retrain',
    default_args=default_args,
    description='Model retraining pipeline for bug priority prediction',
    schedule_interval='0 0 * * 0',  # Weekly on Sunday
    catchup=False,
    tags=['ml', 'bug-priority'],
)


def extract_data(**context):
    """Extract new data from source"""
    logger.info("Extracting raw dataset...")
    import pandas as pd
    
    df = pd.read_csv('ml_pipeline/data/raw/all_departments_bugs_50k.csv')
    logger.info(f"Extracted {len(df)} records")
    context['task_instance'].xcom_push(key='data_shape', value=df.shape)
    return f"Extracted {len(df)} records"


def validate_data(**context):
    """Validate extracted data quality"""
    logger.info("Validating dataset...")
    import pandas as pd
    from ml_pipeline.training.validate_data import DataValidator
    
    df = pd.read_csv('ml_pipeline/data/raw/all_departments_bugs_50k.csv')
    validator = DataValidator()
    validator.run_all_validations(df)
    summary = validator.get_report_summary()
    
    logger.info(f"Validation Summary: {summary}")
    if not summary['all_passed']:
        raise ValueError("Data validation failed.")
    return "Data validation passed"


def preprocess_data(**context):
    """Preprocess and engineer features"""
    logger.info("Preprocessing data...")
    import pandas as pd
    from backend.app.services.feature_engineering import FeatureEngineer
    from sklearn.model_selection import train_test_split
    
    # Load and preprocess
    df = pd.read_csv('ml_pipeline/data/raw/all_departments_bugs_50k.csv')
    
    # Handle missing values
    df = df.dropna(subset=['priority'])
    for col in df.select_dtypes(include=['object']).columns:
        df[col] = df[col].fillna('Unknown')
    for col in df.select_dtypes(include=['int64', 'float64']).columns:
        df[col] = df[col].fillna(df[col].median())
    
    # Feature engineering
    feature_engineer = FeatureEngineer()
    X = feature_engineer.fit_transform(df)
    
    # Prepare target
    priority_map = {'Low': 0, 'Medium': 1, 'High': 2, 'Critical': 3}
    y = df['priority'].map(priority_map)
    
    # Split and save
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    X_train.to_csv('ml_pipeline/data/processed/X_train.csv', index=False)
    X_test.to_csv('ml_pipeline/data/processed/X_test.csv', index=False)
    y_train.to_csv('ml_pipeline/data/processed/y_train.csv', index=False)
    y_test.to_csv('ml_pipeline/data/processed/y_test.csv', index=False)
    
    # Save fitted Feature Engineer to backend models folder
    feature_engineer.save('backend/app/models/feature_engineer.pkl')
    logger.info(f"Preprocessing complete: {X_train.shape} training samples")
    return "Preprocessing completed"


def train_model(**context):
    """Train the LightGBM model"""
    logger.info("Training LightGBM classifier...")
    import pandas as pd
    from ml_pipeline.training.train import ModelTrainer
    
    # Load preprocessed data
    X_train = pd.read_csv('ml_pipeline/data/processed/X_train.csv')
    y_train = pd.read_csv('ml_pipeline/data/processed/y_train.csv').squeeze()
    
    # Train model
    trainer = ModelTrainer()
    training_results = trainer.train(X_train, y_train, test_size=0.2)
    
    logger.info(f"Training Results: {training_results['metrics']}")
    if not training_results['success']:
        raise ValueError("Model training failed")
        
    # Save model to backend models folder
    trainer.save('backend/app/models/optimized_lightgbm_model.pkl')
    trainer.feature_importance.to_csv('ml_pipeline/data/processed/feature_importance.csv', index=False)
    return f"Model trained with accuracy: {training_results['metrics']['accuracy']:.4f}"


def evaluate_model(**context):
    """Evaluate model performance"""
    logger.info("Evaluating model...")
    import pandas as pd
    from ml_pipeline.training.evaluate import evaluate_model as run_eval
    
    run_eval(
        model_path='backend/app/models/optimized_lightgbm_model.pkl',
        x_test_path='ml_pipeline/data/processed/X_test.csv',
        y_test_path='ml_pipeline/data/processed/y_test.csv'
    )
    return "Model evaluation complete"


def register_model(**context):
    """Register model with MLflow"""
    logger.info("Registering model with MLflow...")
    import mlflow
    import mlflow.lightgbm
    import pickle
    
    mlflow.set_experiment("Bug Priority Predictor - Production")
    
    with mlflow.start_run() as run:
        # Load and register model
        with open('backend/app/models/optimized_lightgbm_model.pkl', 'rb') as f:
            model = pickle.load(f)
            
        mlflow.lightgbm.log_model(model, 'model')
        logger.info(f"Model registered with run ID: {run.info.run_id}")
        return f"Model registered - Run ID: {run.info.run_id}"


def notify_completion(**context):
    """Send completion notification"""
    logger.info("✓ Model retraining pipeline completed successfully")
    return "Retraining pipeline completed"


# Define tasks
task_extract = PythonOperator(
    task_id='extract_data',
    python_callable=extract_data,
    dag=dag,
)

task_validate = PythonOperator(
    task_id='validate_data',
    python_callable=validate_data,
    dag=dag,
)

task_preprocess = PythonOperator(
    task_id='preprocess_data',
    python_callable=preprocess_data,
    dag=dag,
)

task_train = PythonOperator(
    task_id='train_model',
    python_callable=train_model,
    dag=dag,
)

task_evaluate = PythonOperator(
    task_id='evaluate_model',
    python_callable=evaluate_model,
    dag=dag,
)

task_register = PythonOperator(
    task_id='register_model',
    python_callable=register_model,
    dag=dag,
)

task_notify = PythonOperator(
    task_id='notify_completion',
    python_callable=notify_completion,
    dag=dag,
)

# Set task dependencies
task_extract >> task_validate >> task_preprocess >> task_train >> task_evaluate >> task_register >> task_notify
