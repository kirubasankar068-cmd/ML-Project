import { create } from 'zustand';
import { PredictionResult, BugInput } from '../types';

interface StoreState {
  predictions: (PredictionResult & { input: BugInput })[];
  addPrediction: (prediction: PredictionResult, input: BugInput) => void;
  clearStore: () => void;
  getDashboardStats: () => {
    total_predictions: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    avg_confidence: number;
    service_status: string;
  };
  getDashboardHistory: () => {
    timestamps: string[];
    confidences: number[];
    labels: string[];
  };
}

// Helper to load predictions from local storage
const loadStoredPredictions = (): (PredictionResult & { input: BugInput })[] => {
  try {
    const data = localStorage.getItem('smart_bug_predictions');
    const parsed = data ? JSON.parse(data) : [];
    return parsed.map((p: any) => {
      const conf = p.confidence_score ?? p.prediction?.confidence ?? p.confidence ?? 0.85;
      const rawPrio = p.priority_label ?? p.priority ?? p.prediction?.priority ?? 'Medium';
      const priority = String(rawPrio).charAt(0).toUpperCase() + String(rawPrio).slice(1);

      const updated = {
        ...p,
        priority_label: priority,
        confidence_score: conf
      };
      if (updated.prediction) {
        updated.prediction = {
          ...updated.prediction,
          priority: priority,
          confidence: conf
        };
      }
      return updated;
    });
  } catch (e) {
    console.error('Failed to parse predictions from localStorage:', e);
    return [];
  }
};

export const usePredictionStore = create<StoreState>((set, get) => ({
  predictions: loadStoredPredictions(),
  addPrediction: (prediction, input) =>
    set((state) => {
      const newItem = { ...prediction, input };
      const updated = [newItem, ...state.predictions].slice(0, 100);
      try {
        localStorage.setItem('smart_bug_predictions', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save predictions to localStorage:', e);
      }
      return { predictions: updated };
    }),
  clearStore: () =>
    set(() => {
      try {
        localStorage.removeItem('smart_bug_predictions');
      } catch (e) {
        console.error('Failed to clear predictions from localStorage:', e);
      }
      return { predictions: [] };
    }),
  getDashboardStats: () => {
    const list = get().predictions;
    const stats = {
      total_predictions: list.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      avg_confidence: 0.85,
    };
    if (list.length > 0) {
      let sumConf = 0;
      list.forEach((p) => {
        const priority = p.priority_label.toLowerCase();
        if (priority === 'critical') stats.critical += 1;
        else if (priority === 'high') stats.high += 1;
        else if (priority === 'medium') stats.medium += 1;
        else if (priority === 'low') stats.low += 1;
        sumConf += p.confidence_score;
      });
      stats.avg_confidence = parseFloat((sumConf / list.length).toFixed(2));
    }
    return {
      ...stats,
      service_status: 'healthy',
    };
  },
  getDashboardHistory: () => {
    const list = [...get().predictions].reverse();
    if (list.length === 0) {
      return {
        timestamps: ['09:00 AM', '10:00 AM', '11:00 AM'],
        confidences: [0.85, 0.85, 0.85],
        labels: ['Medium', 'Medium', 'Medium'],
      };
    }
    return {
      timestamps: list.map((p) => p.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })),
      confidences: list.map((p) => p.confidence_score),
      labels: list.map((p) => p.priority_label),
    };
  },
}));

