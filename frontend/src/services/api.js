import axios from 'axios';

// Dynamically determine baseURL
const baseURL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
  ? 'http://localhost:8000/api'
  : '/api';

const API = axios.create({
  baseURL: baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to append authorization token
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    } else {
      // Bypasses auth in development mode using guest auto-login tokens
      const devBypass = localStorage.getItem('dev_bypass') === 'true';
      if (devBypass) {
        config.headers['Authorization'] = 'Bearer developer-mode-token';
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle unauth/expiry redirects
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      console.warn("Unauthenticated request - redirecting to login context.");
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: async (username, password) => {
    const res = await API.post('/login', { username, password });
    if (res.data && res.data.access_token) {
      localStorage.setItem('token', res.data.access_token);
      localStorage.setItem('role', res.data.role);
      localStorage.setItem('username', res.data.username);
    }
    return res.data;
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
  },
};

export const predictorAPI = {
  predict: async (bugReport) => {
    const res = await API.post('/predict', bugReport);
    return res.data;
  },
  predictBatch: async (bugReports) => {
    const res = await API.post('/batch-predict', { bugs: bugReports });
    return res.data;
  },
  predictFile: async (formData) => {
    // If formData does not have cross_check, we append it.
    // In React code, we'll append the value of crossCheck toggle directly before calling.
    const res = await API.post('/predict-file', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },
  predictImage: async (formData) => {
    const res = await API.post('/predict-image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },
  getHistory: async (limit = 50) => {
    const res = await API.get(`/prediction-history?limit=${limit}`);
    return res.data;
  },
  getHumanReviewQueue: async () => {
    const res = await API.get('/human-review');
    return res.data;
  },
  resolveHumanReview: async (bugId, approvedPriority, reason) => {
    const res = await API.post(`/human-review/${bugId}`, {
      approved_priority: approvedPriority,
      reason: reason
    });
    return res.data;
  }
};

export const analyticsAPI = {
  getStats: async () => {
    const res = await API.get('/analytics/stats');
    return res.data;
  },
  getDistribution: async () => {
    const res = await API.get('/analytics/charts/distribution');
    return res.data;
  },
  getConfidenceTrend: async () => {
    const res = await API.get('/analytics/charts/confidence-trend');
    return res.data;
  }
};

export const monitoringAPI = {
  getHealth: async () => {
    const res = await API.get('/monitoring/health');
    return res.data;
  },
  getDriftReport: async () => {
    const res = await API.get('/monitoring/drift');
    return res.data;
  },
  getPerformance: async () => {
    const res = await API.get('/monitoring/performance');
    return res.data;
  },
  getLiveStatsWSUrl: () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Fallback if hosting is different
    return `${protocol}//localhost:8000/api/monitoring/live-stats`;
  }
};

export const systemAPI = {
  retrain: async () => {
    const res = await API.post('/monitoring/retrain');
    return res.data;
  },
  getRetrainStatus: async () => {
    const res = await API.get('/monitoring/retrain/status');
    return res.data;
  },
  getModelInfo: async () => {
    const res = await API.get('/monitoring/model-info');
    return res.data;
  },
};

export default API;
