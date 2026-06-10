import { useState, useCallback } from 'react';
import { predictorAPI } from '../services/api';

export const usePrediction = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const predict = useCallback(async (bugReport) => {
    setLoading(true);
    setError(null);
    try {
      const data = await predictorAPI.predict(bugReport);
      setResult(data);
      return data;
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Prediction execution failed.';
      setError(errMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  return {
    loading,
    error,
    result,
    predict,
    reset,
  };
};

export default usePrediction;
