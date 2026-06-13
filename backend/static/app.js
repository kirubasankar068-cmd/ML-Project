document.addEventListener('DOMContentLoaded', () => {
    // --- Global Application State ---
    const state = {
        modelLoaded: false,
        totalPredictions: 0,
        avgConfidence: 0.0,
        avgLatency: 0,
        predictionsHistory: [],
        activeAlerts: [],
        thresholds: {
            successRate: 95,
            latency: 200,
            confidence: 60
        },
        uploadedImageBase64: null,
        uploadedImageFilename: null,
        imageSource: null,          // 'upload' | 'capture'
        imageAnalysisData: null,    // analysis result object
        imageAnalyzeMode: true,     // true = analyze, false = attach only
        batchBugsData: []
    };

    // --- Chart References ---
    let chartConfidenceTime = null;
    let chartPriorityDist = null;
    let chartBatchDist = null;
    let chartFeatureImportance = null;

    // --- DOM Elements ---
    const sidebarItems = document.querySelectorAll('.sidebar-nav li');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');
    const btnRefreshData = document.getElementById('btn-refresh-data');
    
    // Toast Container
    const toastContainer = document.getElementById('toast-container');

    // Page titles mapping
    const pageHeaders = {
        'dashboard-tab': { title: 'System Overview', subtitle: 'Real-time status and operational insights' },
        'single-predict-tab': { title: 'Single Bug Analysis', subtitle: 'Predict priority for an individual bug report' },
        'batch-predict-tab': { title: 'Batch File Processing', subtitle: 'Classify multiple bug reports using a CSV file' },
        'model-metrics-tab': { title: 'Model Performance', subtitle: 'Deep dive into classifier accuracy and feature weights' },
        'alerts-tab': { title: 'Alerts & Thresholds', subtitle: 'Manage SLA parameters and active warnings' }
    };

    // --- Navigation ---
    sidebarItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTab = item.getAttribute('data-target');
            
            // Toggle active sidebar item
            sidebarItems.forEach(li => li.classList.remove('active'));
            item.classList.add('active');

            // Toggle active tab pane
            tabPanes.forEach(pane => {
                pane.classList.remove('active');
                if (pane.id === targetTab) {
                    pane.classList.add('active');
                }
            });

            // Update headers
            if (pageHeaders[targetTab]) {
                pageTitle.textContent = pageHeaders[targetTab].title;
                pageSubtitle.textContent = pageHeaders[targetTab].subtitle;
            }

            // Tab-specific initializations
            if (targetTab === 'model-metrics-tab') {
                setTimeout(initFeatureImportanceChart, 100);
            }
        });
    });

    // Refresh Button Handler
    btnRefreshData.addEventListener('click', () => {
        checkSystemHealth();
        loadModelMetrics();
        showToast('Data refreshed successfully', 'success');
    });

    // --- Toast Notifications ---
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconClass = 'fa-circle-info';
        if (type === 'success') iconClass = 'fa-circle-check';
        if (type === 'error') iconClass = 'fa-circle-xmark';
        if (type === 'warning') iconClass = 'fa-triangle-exclamation';

        toast.innerHTML = `
            <i class="fa-solid ${iconClass}"></i>
            <span>${message}</span>
        `;
        toastContainer.appendChild(toast);

        // Slide out and remove
        setTimeout(() => {
            toast.style.transform = 'translateX(120%)';
            toast.style.opacity = '0';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }

    // --- API Configuration ---
    const API_BASE_URL = window.location.origin; // Same origin hosting

    // --- System Health & Connection ---
    async function checkSystemHealth() {
        try {
            const footerStatusInd = document.getElementById('footer-status-indicator');
            const footerStatusLabel = document.getElementById('footer-status-label');
            const dashModelStatus = document.getElementById('dash-model-status');
            const dashModelDetails = document.getElementById('dash-model-details');

            const response = await fetch(`${API_BASE_URL}/health`);
            const data = await response.json();
            
            if (response.ok && data.status === 'healthy') {
                state.modelLoaded = data.model_loaded;
                
                footerStatusInd.className = 'status-indicator status-green';
                footerStatusLabel.textContent = 'System Online';
                
                dashModelStatus.textContent = 'Healthy';
                dashModelStatus.style.color = 'var(--color-low)';
                dashModelDetails.textContent = `Model loaded | API version ${data.api_version || '1.0.0'}`;
            } else {
                state.modelLoaded = false;
                footerStatusInd.className = 'status-indicator status-orange';
                footerStatusLabel.textContent = 'Model Unloaded';
                dashModelStatus.textContent = 'Degraded';
                dashModelStatus.style.color = 'var(--color-medium)';
                dashModelDetails.textContent = 'FastAPI server online, model not loaded';
            }
        } catch (err) {
            state.modelLoaded = false;
            const footerStatusInd = document.getElementById('footer-status-indicator');
            const footerStatusLabel = document.getElementById('footer-status-label');
            const dashModelStatus = document.getElementById('dash-model-status');
            const dashModelDetails = document.getElementById('dash-model-details');

            footerStatusInd.className = 'status-indicator status-red';
            footerStatusLabel.textContent = 'Server Offline';
            dashModelStatus.textContent = 'Offline';
            dashModelStatus.style.color = 'var(--color-critical)';
            dashModelDetails.textContent = 'Cannot connect to API server';
            console.error('Health check failed:', err);
        }
        
        updateDashboardCards();
        checkThresholdAlerts();
    }

    // --- Stats Dashboard Visualizer ---
    function updateDashboardCards() {
        document.getElementById('dash-total-predictions').textContent = state.totalPredictions;
        document.getElementById('dash-avg-confidence').textContent = `${(state.avgConfidence * 100).toFixed(1)}%`;
        document.getElementById('dash-avg-latency').textContent = `${state.avgLatency.toFixed(0)}ms`;
    }

    // --- Charts Handling (Chart.js) ---
    function updateDashboardCharts() {
        // 1. Confidence Over Time Line Chart
        const recentHistory = state.predictionsHistory.slice(-10);
        const labels = recentHistory.map((_, i) => `#${state.totalPredictions - recentHistory.length + i + 1}`);
        const confidenceData = recentHistory.map(pred => pred.confidence * 100);

        if (!chartConfidenceTime) {
            const ctx = document.getElementById('chart-confidence-time').getContext('2d');
            chartConfidenceTime = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels.length ? labels : ['0'],
                    datasets: [{
                        label: 'Confidence (%)',
                        data: confidenceData.length ? confidenceData : [0],
                        borderColor: '#00a8cc',
                        backgroundColor: 'rgba(0, 168, 204, 0.1)',
                        borderWidth: 2,
                        pointBackgroundColor: '#00a8cc',
                        pointBorderColor: 'rgba(255, 255, 255, 0.2)',
                        pointRadius: 4,
                        tension: 0.3,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: { mode: 'index', intersect: false }
                    },
                    scales: {
                        y: {
                            min: 0,
                            max: 100,
                            grid: { color: 'rgba(255, 255, 255, 0.05)' },
                            ticks: { color: '#64748b' }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#64748b' }
                        }
                    }
                }
            });
        } else {
            chartConfidenceTime.data.labels = labels.length ? labels : ['0'];
            chartConfidenceTime.data.datasets[0].data = confidenceData.length ? confidenceData : [0];
            chartConfidenceTime.update();
        }

        // 2. Priority Doughnut Distribution Chart
        const counts = { Low: 0, Medium: 0, High: 0, Critical: 0 };
        state.predictionsHistory.forEach(pred => {
            if (counts[pred.priority] !== undefined) {
                counts[pred.priority]++;
            }
        });

        const distData = [counts.Low, counts.Medium, counts.High, counts.Critical];
        
        if (!chartPriorityDist) {
            const ctx = document.getElementById('chart-priority-dist').getContext('2d');
            chartPriorityDist = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Low', 'Medium', 'High', 'Critical'],
                    datasets: [{
                        data: distData,
                        backgroundColor: ['#10b981', '#f59e0b', '#f97316', '#ef4444'],
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 } }
                        }
                    },
                    cutout: '65%'
                }
            });
        } else {
            chartPriorityDist.data.datasets[0].data = distData;
            chartPriorityDist.update();
        }
    }

    function initFeatureImportanceChart() {
        if (chartFeatureImportance) return; // Already loaded

        const features = [
            'severity_encoded',
            'affected_users',
            'tfidf_error',
            'tfidf_fail',
            'desc_length',
            'is_reproducible',
            'component_encoded',
            'title_length'
        ];
        const weights = [0.38, 0.22, 0.12, 0.09, 0.07, 0.05, 0.04, 0.03];

        const ctx = document.getElementById('chart-feature-importance').getContext('2d');
        chartFeatureImportance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: features,
                datasets: [{
                    data: weights,
                    backgroundColor: 'rgba(0, 168, 204, 0.7)',
                    borderColor: 'var(--primary)',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#64748b' }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8' }
                    }
                }
            }
        });
    }

    // --- Single Prediction Tab Logic ---
    const singleForm = document.getElementById('single-predict-form');
    const dragArea = document.getElementById('image-drag-area');
    const imageUpload = document.getElementById('image-upload');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const imagePreview = document.getElementById('image-preview');
    const btnRemoveImg = document.getElementById('btn-remove-img');
    const predictBtn = document.getElementById('btn-predict-single');
    const resultCard = document.getElementById('prediction-result-card');
    const btnCaptureScreenshot = document.getElementById('btn-capture-screenshot');
    const imgAnalyzingOverlay = document.getElementById('img-analyzing-overlay');
    const imgAnalysisPreview = document.getElementById('img-analysis-preview');
    const imgSignalTags = document.getElementById('img-signal-tags');
    const imgAnalysisInsight = document.getElementById('img-analysis-insight');
    const imgSeverityBadge = document.getElementById('img-analysis-severity-badge');
    const modeAnalyzeBtn = document.getElementById('mode-analyze');
    const modeAttachBtn = document.getElementById('mode-attach');

    // Image mode toggle
    modeAnalyzeBtn.addEventListener('click', () => {
        state.imageAnalyzeMode = true;
        modeAnalyzeBtn.classList.add('active');
        modeAttachBtn.classList.remove('active');
        // Re-analyze current image if present
        if (state.uploadedImageBase64) {
            runImageAnalysis(state.uploadedImageBase64);
        }
    });

    modeAttachBtn.addEventListener('click', () => {
        state.imageAnalyzeMode = false;
        modeAttachBtn.classList.add('active');
        modeAnalyzeBtn.classList.remove('active');
        imgAnalysisPreview.style.display = 'none';
        state.imageAnalysisData = null;
    });

    // Drag and drop events
    ['dragenter', 'dragover'].forEach(eventName => {
        dragArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            dragArea.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dragArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            dragArea.classList.remove('dragover');
        }, false);
    });

    dragArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleImageFile(files[0], 'upload');
    });

    imageUpload.addEventListener('change', (e) => {
        handleImageFile(e.target.files[0], 'upload');
    });

    btnRemoveImg.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        resetImageUpload();
    });

    // Screenshot capture using Screen Capture API
    btnCaptureScreenshot.addEventListener('click', async () => {
        try {
            btnCaptureScreenshot.classList.add('capturing');
            btnCaptureScreenshot.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i><span>Capturing...</span>';

            // Request screen capture
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { mediaSource: 'screen', cursor: 'always' },
                preferCurrentTab: true
            });

            // Create video element to capture frame
            const video = document.createElement('video');
            video.srcObject = stream;
            video.autoplay = true;

            await new Promise(resolve => {
                video.onloadedmetadata = () => {
                    video.play();
                    resolve();
                };
            });

            // Small delay to let frame render
            await new Promise(r => setTimeout(r, 300));

            // Draw frame to canvas
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);

            // Stop stream tracks
            stream.getTracks().forEach(t => t.stop());

            const dataUrl = canvas.toDataURL('image/png');
            handleImageDataUrl(dataUrl, 'capture');

        } catch (err) {
            if (err.name !== 'NotAllowedError') {
                showToast('Screenshot capture failed: ' + err.message, 'error');
            } else {
                showToast('Screenshot capture cancelled', 'info');
            }
        } finally {
            btnCaptureScreenshot.classList.remove('capturing');
            btnCaptureScreenshot.innerHTML = '<i class="fa-solid fa-camera-retro"></i><span>Capture Screenshot</span>';
        }
    });

    function handleImageFile(file, source = 'upload') {
        if (!file || !file.type.startsWith('image/')) {
            showToast('Please upload an image file (JPG, PNG, WEBP)', 'error');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            showToast('Image size exceeds 10MB limit', 'error');
            return;
        }
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = () => {
            handleImageDataUrl(reader.result, source);
        };
    }

    function handleImageDataUrl(dataUrl, source = 'upload') {
        state.uploadedImageBase64 = dataUrl;
        state.imageSource = source;
        imagePreview.src = dataUrl;
        imagePreviewContainer.style.display = 'flex';

        if (state.imageAnalyzeMode) {
            runImageAnalysis(dataUrl);
        }

        // Show source toast
        const sourceLabel = source === 'capture' ? '📸 Screenshot captured' : '🖼️ Image uploaded';
        showToast(sourceLabel + (state.imageAnalyzeMode ? ' — analyzing for bug signals...' : ''), 'success');
    }

    function resetImageUpload() {
        state.uploadedImageBase64 = null;
        state.uploadedImageFilename = null;
        state.imageSource = null;
        state.imageAnalysisData = null;
        imageUpload.value = '';
        imagePreview.src = '#';
        imagePreviewContainer.style.display = 'none';
        imgAnalysisPreview.style.display = 'none';
    }

    // =====================================================
    // IMAGE ANALYSIS ENGINE (Canvas-based Computer Vision)
    // =====================================================
    async function runImageAnalysis(dataUrl) {
        // Show analyzing overlay
        imgAnalyzingOverlay.style.display = 'flex';
        imgAnalysisPreview.style.display = 'none';

        try {
            const result = await analyzeImageCanvas(dataUrl);
            state.imageAnalysisData = result;
            displayImageAnalysisPreview(result);
        } catch (err) {
            console.warn('Image analysis error:', err);
            imgAnalysisPreview.style.display = 'none';
        } finally {
            imgAnalyzingOverlay.style.display = 'none';
        }
    }

    function analyzeImageCanvas(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    // Downsample for performance: max 400px
                    const scale = Math.min(1, 400 / Math.max(img.width, img.height));
                    canvas.width = Math.floor(img.width * scale);
                    canvas.height = Math.floor(img.height * scale);
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const pixels = imageData.data;
                    const totalPixels = canvas.width * canvas.height;

                    let totalR = 0, totalG = 0, totalB = 0;
                    let redPixels = 0, darkPixels = 0, brightPixels = 0;
                    let orangePixels = 0, yellowPixels = 0;
                    let minLum = 255, maxLum = 0;
                    const lumValues = [];

                    for (let i = 0; i < pixels.length; i += 4) {
                        const r = pixels[i];
                        const g = pixels[i + 1];
                        const b = pixels[i + 2];

                        totalR += r; totalG += g; totalB += b;

                        // Luminance (perceived brightness)
                        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                        lumValues.push(lum);
                        if (lum < minLum) minLum = lum;
                        if (lum > maxLum) maxLum = lum;

                        if (lum < 60) darkPixels++;
                        if (lum > 200) brightPixels++;

                        // Red dominance (errors, alerts)
                        if (r > 160 && r > g * 1.5 && r > b * 1.5) redPixels++;
                        // Orange (warnings)
                        if (r > 180 && g > 80 && g < 160 && b < 80) orangePixels++;
                        // Yellow (caution)
                        if (r > 180 && g > 160 && b < 80) yellowPixels++;
                    }

                    const avgR = totalR / totalPixels;
                    const avgG = totalG / totalPixels;
                    const avgB = totalB / totalPixels;
                    const avgBrightness = (avgR * 0.299 + avgG * 0.587 + avgB * 0.114);

                    const redRatio = redPixels / totalPixels;
                    const orangeRatio = orangePixels / totalPixels;
                    const yellowRatio = yellowPixels / totalPixels;
                    const darkRatio = darkPixels / totalPixels;
                    const brightRatio = brightPixels / totalPixels;

                    // Contrast estimation (difference of high/low luminance)
                    const contrast = (maxLum - minLum) / 255;

                    // Edge density estimation via simple pixel diff
                    let edgeCount = 0;
                    const w = canvas.width;
                    for (let y = 1; y < canvas.height - 1; y++) {
                        for (let x = 1; x < w - 1; x++) {
                            const idx = (y * w + x) * 4;
                            const idxRight = (y * w + x + 1) * 4;
                            const idxDown = ((y + 1) * w + x) * 4;
                            const diffH = Math.abs(pixels[idx] - pixels[idxRight]) +
                                          Math.abs(pixels[idx+1] - pixels[idxRight+1]) +
                                          Math.abs(pixels[idx+2] - pixels[idxRight+2]);
                            const diffV = Math.abs(pixels[idx] - pixels[idxDown]) +
                                          Math.abs(pixels[idx+1] - pixels[idxDown+1]) +
                                          Math.abs(pixels[idx+2] - pixels[idxDown+2]);
                            if (diffH + diffV > 80) edgeCount++;
                        }
                    }
                    const edgeDensity = edgeCount / ((canvas.width - 2) * (canvas.height - 2));

                    // Entropy (image complexity / information density)
                    const histR = new Array(32).fill(0);
                    for (let i = 0; i < pixels.length; i += 4) {
                        histR[Math.floor(pixels[i] / 8)]++;
                    }
                    let entropy = 0;
                    for (const cnt of histR) {
                        if (cnt > 0) {
                            const p = cnt / totalPixels;
                            entropy -= p * Math.log2(p);
                        }
                    }
                    const normalizedEntropy = entropy / 5.0; // 5 = max ~log2(32)

                    // Dominant color region (top-left 20% - often where errors appear in UIs)
                    const regionCanvas = document.createElement('canvas');
                    regionCanvas.width = Math.max(1, Math.floor(canvas.width * 0.3));
                    regionCanvas.height = Math.max(1, Math.floor(canvas.height * 0.2));
                    const rCtx = regionCanvas.getContext('2d');
                    rCtx.drawImage(img, 0, 0, regionCanvas.width * (1/scale), regionCanvas.height * (1/scale), 0, 0, regionCanvas.width, regionCanvas.height);
                    const regionData = rCtx.getImageData(0, 0, regionCanvas.width, regionCanvas.height).data;
                    let regionRedPixels = 0;
                    for (let i = 0; i < regionData.length; i += 4) {
                        if (regionData[i] > 150 && regionData[i] > regionData[i+1] * 1.4 && regionData[i] > regionData[i+2] * 1.4) regionRedPixels++;
                    }
                    const regionRedRatio = regionRedPixels / (regionCanvas.width * regionCanvas.height);

                    // ---- Generate signals ----
                    const signals = [];
                    let severityScore = 0; // 0–10 scale

                    if (redRatio > 0.08) {
                        signals.push({ level: 'critical', icon: 'fa-circle-exclamation', title: 'High Red Color Presence', detail: `${(redRatio * 100).toFixed(1)}% red pixels detected — common in error dialogs, crash screens` });
                        severityScore += redRatio > 0.15 ? 3 : 1.5;
                    }
                    if (regionRedRatio > 0.05) {
                        signals.push({ level: 'high', icon: 'fa-triangle-exclamation', title: 'Top-region Alert Colors', detail: 'Red/error tones detected in header region — likely error banner or alert bar' });
                        severityScore += 1.5;
                    }
                    if (orangeRatio > 0.05) {
                        signals.push({ level: 'medium', icon: 'fa-bell', title: 'Warning Color Presence', detail: `${(orangeRatio * 100).toFixed(1)}% orange tones — may indicate warning or degraded state` });
                        severityScore += 1.0;
                    }
                    if (darkRatio > 0.5 && avgBrightness < 80) {
                        signals.push({ level: 'high', icon: 'fa-moon', title: 'Dark Screen / Crash Detected', detail: 'Predominantly dark image — may indicate black screen, crash, or UI freeze' });
                        severityScore += 2.0;
                    }
                    if (contrast > 0.7) {
                        signals.push({ level: 'medium', icon: 'fa-adjust', title: 'High Contrast Interface', detail: 'High contrast suggests complex error message with distinct dialog boxes' });
                        severityScore += 0.5;
                    }
                    if (edgeDensity > 0.25) {
                        signals.push({ level: 'info', icon: 'fa-table-cells', title: 'Complex UI Structure', detail: `Edge density ${(edgeDensity * 100).toFixed(0)}% — rich UI with many elements, likely technical screen` });
                        severityScore += 0.5;
                    }
                    if (normalizedEntropy > 0.75) {
                        signals.push({ level: 'info', icon: 'fa-database', title: 'High Information Density', detail: 'Image contains dense information — possibly log output or data-heavy screen' });
                        severityScore += 0.3;
                    }
                    if (yellowRatio > 0.04) {
                        signals.push({ level: 'medium', icon: 'fa-star', title: 'Caution Colors Detected', detail: `${(yellowRatio * 100).toFixed(1)}% yellow tones — may indicate warning or highlighted state` });
                        severityScore += 0.5;
                    }
                    if (brightRatio > 0.6 && redRatio < 0.03) {
                        signals.push({ level: 'low', icon: 'fa-sun', title: 'Clean / Normal Screen State', detail: 'Bright, balanced image with no obvious error tones — may indicate minor visual bug' });
                        severityScore = Math.max(0, severityScore - 1);
                    }
                    if (signals.length === 0) {
                        signals.push({ level: 'info', icon: 'fa-circle-info', title: 'No Obvious Error Signals', detail: 'No strong color-based severity signals detected. Using form fields for prediction.' });
                    }

                    // Clamp score 0–10
                    severityScore = Math.min(10, Math.max(0, severityScore));

                    // Map to severity label
                    let imageSeverity = 'Low';
                    if (severityScore >= 7) imageSeverity = 'Critical';
                    else if (severityScore >= 4.5) imageSeverity = 'High';
                    else if (severityScore >= 2) imageSeverity = 'Medium';

                    // Impact on prediction (0.0 – 0.35 = up to 35% influence)
                    const imageContribution = Math.min(0.35, severityScore / 10 * 0.35);

                    resolve({
                        avgBrightness: Math.round(avgBrightness),
                        redRatio: parseFloat((redRatio * 100).toFixed(1)),
                        contrast: parseFloat((contrast * 100).toFixed(0)),
                        edgeDensity: parseFloat((edgeDensity * 100).toFixed(0)),
                        entropy: parseFloat((normalizedEntropy * 100).toFixed(0)),
                        severityScore: parseFloat(severityScore.toFixed(1)),
                        imageSeverity,
                        imageContribution: parseFloat(imageContribution.toFixed(3)),
                        signals,
                        dimensions: `${img.width}×${img.height}`
                    });
                } catch (err2) {
                    reject(err2);
                }
            };
            img.onerror = reject;
            img.src = dataUrl;
        });
    }

    function displayImageAnalysisPreview(result) {
        // Set severity badge
        imgSeverityBadge.textContent = result.imageSeverity;
        imgSeverityBadge.className = 'img-analysis-badge badge-' + result.imageSeverity.toLowerCase();

        // Build signal tags
        imgSignalTags.innerHTML = '';
        const tagClasses = { critical: 'tag-error', high: 'tag-error', medium: 'tag-warning', low: 'tag-success', info: 'tag-info' };
        const tagIcons = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢', info: '🔵' };
        result.signals.slice(0, 4).forEach(sig => {
            const tag = document.createElement('span');
            tag.className = 'img-signal-tag ' + (tagClasses[sig.level] || 'tag-info');
            tag.textContent = tagIcons[sig.level] + ' ' + sig.title;
            imgSignalTags.appendChild(tag);
        });

        // Insight text
        imgAnalysisInsight.innerHTML = `<strong>Score: ${result.severityScore}/10</strong> · ${result.signals[0]?.detail || 'Analysis complete'}. <em>This will ${result.imageContribution > 0.1 ? 'significantly' : 'slightly'} adjust the priority prediction.</em>`;

        imgAnalysisPreview.style.display = 'block';
    }

    // Submit prediction form
    singleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!state.modelLoaded) {
            showToast('The ML model is currently offline. Running fallback mock analysis.', 'warning');
        }

        // Show spinner
        predictBtn.disabled = true;
        predictBtn.querySelector('.btn-text').style.opacity = '0.5';
        predictBtn.querySelector('.spinner').style.display = 'inline-block';

        // Prepare request
        const bugReport = {
            title: document.getElementById('title').value,
            description: document.getElementById('description').value,
            component: document.getElementById('component').value,
            severity: document.getElementById('severity').value,
            affected_users: parseInt(document.getElementById('affected_users').value),
            is_reproducible: document.getElementById('is_reproducible').checked,
            reported_by: document.getElementById('reported_by').value || null
        };

        const startTime = performance.now();

        try {
            // Upload image first if attached
            if (state.uploadedImageBase64) {
                try {
                    const fileObj = imageUpload.files[0];
                    if (fileObj) {
                        const formData = new FormData();
                        formData.append('file', fileObj);
                        
                        const uploadRes = await fetch(`${API_BASE_URL}/upload-image`, {
                            method: 'POST',
                            body: formData
                        });
                        if (uploadRes.ok) {
                            const uploadData = await uploadRes.json();
                            state.uploadedImageFilename = uploadData.filename;
                        }
                    }
                } catch (imgErr) {
                    console.warn('Failed to upload image:', imgErr);
                }
            }

            let predictionResult = null;

            if (state.modelLoaded) {
                // Call real FastAPI endpoint
                const response = await fetch(`${API_BASE_URL}/predict`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bugReport)
                });
                
                if (response.ok) {
                    const apiData = await response.json();
                    predictionResult = {
                        bug_id: apiData.bug_id,
                        priority: apiData.prediction.priority,
                        priority_score: apiData.prediction.priority_score,
                        confidence: apiData.prediction.confidence,
                        probabilities: apiData.prediction.probabilities,
                        recommendation: apiData.recommendation,
                        reasoning: apiData.reasoning,
                        timestamp: apiData.timestamp
                    };

                    // If image analysis available, blend it into confidence
                    if (state.imageAnalysisData && state.imageAnalyzeMode) {
                        predictionResult = blendImageSignals(predictionResult, state.imageAnalysisData);
                    }
                } else {
                    const errData = await response.json();
                    throw new Error(errData.error || 'Prediction service error');
                }
            } else {
                // Model is offline, generate local mock classification
                await new Promise(r => setTimeout(r, 800)); // Simulate delay
                
                // Deterministic mock logic matching backend rules
                let mockScore = 0.5;
                if (bugReport.severity === 'critical') mockScore += 2.0;
                if (bugReport.severity === 'high') mockScore += 1.2;
                if (bugReport.affected_users > 100) mockScore += 0.8;
                if (bugReport.is_reproducible) mockScore += 0.5;

                // Blend in image analysis signals if available
                const imgData = state.imageAnalyzeMode ? state.imageAnalysisData : null;
                if (imgData) {
                    // Image severity score (0–10) adds up to 1.5 to mock score
                    mockScore += (imgData.severityScore / 10) * 1.5;
                }

                let mockPriority = 'Low';
                let mockRec = 'Add to backlog for future consideration';
                let mockReason = 'Low impact or severity';

                if (mockScore >= 3.5) {
                    mockPriority = 'Critical';
                    mockRec = 'URGENT: Assign to senior developer immediately';
                    mockReason = `Critical severity reported; Reproducible bug affecting ${bugReport.affected_users} users`;
                } else if (mockScore >= 2.2) {
                    mockPriority = 'High';
                    mockRec = 'Prioritize in sprint planning';
                    mockReason = `High severity/impact bug reported affecting ${bugReport.affected_users} users`;
                } else if (mockScore >= 1.0) {
                    mockPriority = 'Medium';
                    mockRec = 'Consider for upcoming sprint';
                    mockReason = 'Medium severity issue; Bug is reproducible';
                }

                // If image signals strongly suggest critical, escalate
                if (imgData && imgData.imageSeverity === 'Critical' && mockPriority !== 'Critical') {
                    const prevPriority = mockPriority;
                    const priorities = ['Low', 'Medium', 'High', 'Critical'];
                    const idx = priorities.indexOf(mockPriority);
                    mockPriority = priorities[Math.min(idx + 1, 3)];
                    mockReason += `. Screenshot analysis detected critical visual signals (escalated from ${prevPriority})`;
                    mockRec = mockPriority === 'Critical' ? 'URGENT: Assign to senior developer immediately' : 'Prioritize in sprint planning';
                }

                const mockProbs = { Low: 0.08, Medium: 0.08, High: 0.08, Critical: 0.08 };
                mockProbs[mockPriority] = 0.76;

                // Adjust probabilities based on image signals
                if (imgData && imgData.imageContribution > 0) {
                    const imgSevMap = { Low: 0, Medium: 1, High: 2, Critical: 3 };
                    const priorities = ['Low', 'Medium', 'High', 'Critical'];
                    const imgIdx = imgSevMap[imgData.imageSeverity];
                    priorities.forEach((p, i) => {
                        const dist = Math.abs(i - imgIdx);
                        const boost = imgData.imageContribution * Math.max(0, 1 - dist * 0.4);
                        mockProbs[p] = Math.min(0.95, mockProbs[p] + boost);
                    });
                }
                
                // Normalize probabilities
                const sum = Object.values(mockProbs).reduce((a, b) => a + b, 0);
                Object.keys(mockProbs).forEach(k => mockProbs[k] = mockProbs[k]/sum);

                // Confidence boosted by image analysis
                let confidence = 0.75;
                if (imgData && state.imageAnalyzeMode) {
                    confidence = Math.min(0.97, confidence + imgData.imageContribution * 0.6);
                }

                predictionResult = {
                    bug_id: `MOCK_${Date.now()}`,
                    priority: mockPriority,
                    priority_score: mockScore,
                    confidence: confidence,
                    probabilities: mockProbs,
                    recommendation: mockRec,
                    reasoning: `${mockReason}${imgData && state.imageAnalyzeMode ? ` | Image Analysis Score: ${imgData.severityScore}/10 (${imgData.imageSeverity})` : ''} (Simulated Prediction)`,
                    timestamp: new Date().toISOString()
                };
            }

            const latency = performance.now() - startTime;

            // Render output
            displayPredictionResult(predictionResult, latency);
            
            // Add to history
            state.predictionsHistory.push(predictionResult);
            state.totalPredictions++;
            
            // Calculate running averages
            const totalConf = state.predictionsHistory.reduce((acc, curr) => acc + curr.confidence, 0);
            state.avgConfidence = totalConf / state.predictionsHistory.length;
            state.avgLatency = ((state.avgLatency * (state.totalPredictions - 1)) + latency) / state.totalPredictions;

            updateDashboardCards();
            updateDashboardCharts();
            updateHistoryTable();
            checkThresholdAlerts();

            showToast('Prediction generated successfully', 'success');

        } catch (err) {
            showToast(`Prediction failed: ${err.message}`, 'error');
            console.error('Prediction failed:', err);
        } finally {
            // Hide spinner
            predictBtn.disabled = false;
            predictBtn.querySelector('.btn-text').style.opacity = '1';
            predictBtn.querySelector('.spinner').style.display = 'none';
        }
    });

    // Blend image signals with API result
    function blendImageSignals(result, imgData) {
        if (!imgData) return result;
        const sevOrder = { Low: 0, Medium: 1, High: 2, Critical: 3 };
        const priorities = ['Low', 'Medium', 'High', 'Critical'];
        const imgIdx = sevOrder[imgData.imageSeverity] || 0;
        // Boost probabilities toward image severity level
        Object.keys(result.probabilities).forEach((p, i) => {
            const dist = Math.abs(priorities.indexOf(p) - imgIdx);
            const boost = imgData.imageContribution * Math.max(0, 1 - dist * 0.35);
            result.probabilities[p] = Math.min(0.99, result.probabilities[p] + boost);
        });
        // Re-normalize
        const total = Object.values(result.probabilities).reduce((a, b) => a + b, 0);
        Object.keys(result.probabilities).forEach(k => result.probabilities[k] /= total);
        // Potentially upgrade priority
        if (imgData.severityScore >= 7 && sevOrder[result.priority] < 3) {
            result.reasoning += ` [Image signals suggest escalation: ${imgData.imageSeverity}]`;
        }
        // Boost confidence
        result.confidence = Math.min(0.97, result.confidence + imgData.imageContribution * 0.5);
        return result;
    }

    function displayPredictionResult(res, latency) {
        // Swap placeholders
        resultCard.classList.remove('inactive');
        resultCard.querySelector('.result-placeholder').style.display = 'none';
        
        const content = resultCard.querySelector('.result-content');
        content.style.display = 'block';

        // Update fields
        const priorityBlock = document.getElementById('result-priority-block');
        priorityBlock.className = 'priority-display-block ' + res.priority.toLowerCase();
        
        document.getElementById('result-priority-val').textContent = res.priority;
        document.getElementById('result-confidence-val').textContent = `${(res.confidence * 100).toFixed(0)}%`;
        document.getElementById('result-recommendation-val').textContent = res.recommendation;
        document.getElementById('result-reasoning-val').textContent = res.reasoning;

        // Update SVG circle
        const circle = document.getElementById('result-confidence-ring');
        const radius = circle.r.baseVal.value;
        const circumference = radius * 2 * Math.PI;
        
        circle.style.strokeDasharray = `${circumference} ${circumference}`;
        const offset = circumference - (res.confidence * circumference);
        circle.style.strokeDashoffset = offset;

        // Set ring color matching priority
        if (res.priority === 'Low') circle.style.stroke = 'var(--color-low)';
        else if (res.priority === 'Medium') circle.style.stroke = 'var(--color-medium)';
        else if (res.priority === 'High') circle.style.stroke = 'var(--color-high)';
        else if (res.priority === 'Critical') circle.style.stroke = 'var(--color-critical)';

        // Populate probability bars
        const barsContainer = document.getElementById('result-probabilities-container');
        barsContainer.innerHTML = '';
        
        const sortedProbs = Object.entries(res.probabilities).sort((a,b) => b[1] - a[1]);

        sortedProbs.forEach(([label, val]) => {
            const barRow = document.createElement('div');
            barRow.className = 'prob-row';
            
            let color = 'var(--primary)';
            if (label === 'Low') color = 'var(--color-low)';
            if (label === 'Medium') color = 'var(--color-medium)';
            if (label === 'High') color = 'var(--color-high)';
            if (label === 'Critical') color = 'var(--color-critical)';

            barRow.innerHTML = `
                <span class="prob-label">${label}</span>
                <div class="prob-bar-bg">
                    <div class="prob-bar-fill" style="width: 0%; background-color: ${color};"></div>
                </div>
                <span class="prob-val">${(val * 100).toFixed(0)}%</span>
            `;
            barsContainer.appendChild(barRow);
            
            // Trigger animation width
            setTimeout(() => {
                barRow.querySelector('.prob-bar-fill').style.width = `${val * 100}%`;
            }, 100);
        });

        // Set result screenshot if present
        const screenshotBox = document.getElementById('result-screenshot-attached');
        const screenshotImg = document.getElementById('result-screenshot-img');
        
        if (state.uploadedImageBase64) {
            // Add source badge to the h3
            const srcBadge = state.imageSource === 'capture'
                ? `<span class="img-source-badge source-capture"><i class="fa-solid fa-camera-retro"></i> Captured</span>`
                : `<span class="img-source-badge source-upload"><i class="fa-solid fa-cloud-arrow-up"></i> Uploaded</span>`;
            screenshotBox.querySelector('h3').innerHTML = `<i class="fa-solid fa-image"></i> Attached Screenshot ${srcBadge}`;
            screenshotImg.src = state.uploadedImageBase64;
            screenshotBox.style.display = 'block';
        } else {
            screenshotBox.style.display = 'none';
        }

        // === Image Analysis Result Panel ===
        const imgResultPanel = document.getElementById('img-analysis-result-panel');
        const imgData = state.imageAnalyzeMode ? state.imageAnalysisData : null;

        if (imgData && state.uploadedImageBase64) {
            imgResultPanel.style.display = 'block';

            // Grade (A-F scale from severity score)
            const gradeEl = document.getElementById('img-result-grade');
            const grade = imgData.severityScore >= 8 ? 'F' :
                          imgData.severityScore >= 6 ? 'D' :
                          imgData.severityScore >= 4 ? 'C' :
                          imgData.severityScore >= 2 ? 'B' : 'A';
            gradeEl.textContent = grade;
            gradeEl.style.color = grade === 'A' ? 'var(--color-low)' :
                                   grade === 'B' ? 'var(--color-low)' :
                                   grade === 'C' ? 'var(--color-medium)' :
                                   grade === 'D' ? 'var(--color-high)' : 'var(--color-critical)';

            // Metrics strip
            const metricsEl = document.getElementById('img-analysis-metrics');
            metricsEl.innerHTML = `
                <div class="img-metric-item">
                    <div class="img-metric-value">${imgData.avgBrightness}</div>
                    <div class="img-metric-label">Brightness</div>
                </div>
                <div class="img-metric-item">
                    <div class="img-metric-value">${imgData.redRatio}%</div>
                    <div class="img-metric-label">Red Pixels</div>
                </div>
                <div class="img-metric-item">
                    <div class="img-metric-value">${imgData.contrast}%</div>
                    <div class="img-metric-label">Contrast</div>
                </div>
                <div class="img-metric-item">
                    <div class="img-metric-value">${imgData.edgeDensity}%</div>
                    <div class="img-metric-label">Edge Density</div>
                </div>
                <div class="img-metric-item">
                    <div class="img-metric-value">${imgData.severityScore}/10</div>
                    <div class="img-metric-label">Sev. Score</div>
                </div>
                <div class="img-metric-item">
                    <div class="img-metric-value">${imgData.dimensions}</div>
                    <div class="img-metric-label">Resolution</div>
                </div>
            `;

            // Detected signals list
            const sigEl = document.getElementById('img-detected-signals');
            const levelIcon = { critical: 'fa-circle-xmark', high: 'fa-triangle-exclamation', medium: 'fa-bell', low: 'fa-circle-check', info: 'fa-circle-info' };
            sigEl.innerHTML = `
                <div class="img-detected-signals-title">Detected Visual Signals (${imgData.signals.length})</div>
                <div class="img-signal-list">
                    ${imgData.signals.map(sig => `
                        <div class="img-signal-row sig-${sig.level}">
                            <i class="fa-solid ${levelIcon[sig.level] || 'fa-circle-info'}"></i>
                            <div class="img-signal-row-text">
                                <strong>${sig.title}</strong><br>
                                <span>${sig.detail}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;

            // Contribution bar with animation
            const pct = Math.round(imgData.imageContribution * 100);
            document.getElementById('img-contribution-pct').textContent = `${pct}%`;
            // Animate after DOM update
            setTimeout(() => {
                document.getElementById('img-contribution-bar').style.width = `${pct}%`;
            }, 200);

        } else {
            imgResultPanel.style.display = 'none';
        }
    }

    function updateHistoryTable() {
        const tableBody = document.querySelector('#recent-predictions-table tbody');
        
        if (state.predictionsHistory.length === 0) {
            tableBody.innerHTML = `
                <tr class="placeholder-row">
                    <td colspan="7">No prediction records available. Go to <strong>Single Prediction</strong> to start.</td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = '';
        
        // Show last 5 predictions, latest first
        const historyCopy = [...state.predictionsHistory].reverse().slice(0, 5);

        historyCopy.forEach(pred => {
            const row = document.createElement('tr');
            
            // Format time
            const dateObj = new Date(pred.timestamp);
            const timeStr = dateObj.toLocaleTimeString();

            row.innerHTML = `
                <td><code>${pred.bug_id}</code></td>
                <td>Bug description analyzed</td>
                <td>-</td>
                <td>-</td>
                <td><span class="priority-pill priority-${pred.priority.toLowerCase()}">${pred.priority}</span></td>
                <td><strong>${(pred.confidence * 100).toFixed(0)}%</strong></td>
                <td>${timeStr}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    // --- Batch Predictions Tab Logic ---
    const csvDragArea = document.getElementById('csv-drag-area');
    const csvUpload = document.getElementById('csv-upload');
    const btnBrowseCsv = document.getElementById('btn-browse-csv');
    const btnRemoveCsv = document.getElementById('btn-remove-csv');
    const csvFileInfo = document.getElementById('csv-file-info');
    const csvFileName = document.getElementById('csv-file-name');
    const csvFileSize = document.getElementById('csv-file-size');
    const csvActionsPanel = document.getElementById('csv-actions-panel');
    const processBatchBtn = document.getElementById('btn-process-batch');
    const resultsSummarySection = document.getElementById('batch-results-summary-section');
    const btnDownloadTemplate = document.getElementById('btn-download-template');
    const btnDownloadResults = document.getElementById('btn-download-results-csv');

    // Drag and drop CSV
    ['dragenter', 'dragover'].forEach(eventName => {
        csvDragArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            csvDragArea.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        csvDragArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            csvDragArea.classList.remove('dragover');
        }, false);
    });

    csvDragArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleCsvFile(files[0]);
    });

    btnBrowseCsv.addEventListener('click', () => {
        csvUpload.click();
    });

    csvUpload.addEventListener('change', (e) => {
        handleCsvFile(e.target.files[0]);
    });

    btnRemoveCsv.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        resetCsvUpload();
    });

    function handleCsvFile(file) {
        if (!file || !file.name.endsWith('.csv')) {
            showToast('Please upload a valid CSV file', 'error');
            return;
        }

        csvFileName.textContent = file.name;
        csvFileSize.textContent = `(${(file.size / 1024).toFixed(1)} KB)`;
        csvFileInfo.style.display = 'flex';
        
        // Read file contents
        const reader = new FileReader();
        reader.readAsText(file);
        reader.onload = (e) => {
            const csvText = e.target.result;
            parseAndLoadCsv(csvText);
        };
    }

    function resetCsvUpload() {
        csvUpload.value = '';
        csvFileInfo.style.display = 'none';
        csvActionsPanel.style.display = 'none';
        resultsSummarySection.style.display = 'none';
        state.batchBugsData = [];
    }

    function parseAndLoadCsv(text) {
        const lines = text.split('\n');
        if (lines.length < 2) {
            showToast('CSV file is empty or missing data', 'error');
            return;
        }

        const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
        const requiredHeaders = ['title', 'description', 'component', 'severity', 'affected_users', 'is_reproducible'];
        
        // Check headers match
        const headersMatch = requiredHeaders.every(h => headers.includes(h));
        if (!headersMatch) {
            showToast('CSV headers do not match requirements. Refer to the schema.', 'error');
            return;
        }

        state.batchBugsData = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Handle quoted commas inside description properly
            const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
            const values = matches.map(v => v.trim().replace(/^["']|["']$/g, ''));

            if (values.length < headers.length) continue;

            const rowObj = {};
            headers.forEach((h, idx) => {
                rowObj[h] = values[idx];
            });

            // Cast types
            const bug = {
                title: rowObj.title || '',
                description: rowObj.description || '',
                component: rowObj.component || '',
                severity: (rowObj.severity || 'medium').toLowerCase(),
                affected_users: parseInt(rowObj.affected_users || 1),
                is_reproducible: String(rowObj.is_reproducible).toLowerCase() === 'true'
            };

            state.batchBugsData.push(bug);
        }

        if (state.batchBugsData.length > 0) {
            processBatchBtn.querySelector('.btn-text').textContent = `🚀 Process Batch (${state.batchBugsData.length} rows)`;
            csvActionsPanel.style.display = 'block';
            showToast(`Loaded ${state.batchBugsData.length} bugs from CSV`, 'success');
        } else {
            showToast('No valid rows found in CSV file', 'error');
        }
    }

    // Process batch predictions
    processBatchBtn.addEventListener('click', async () => {
        if (!state.batchBugsData.length) return;

        processBatchBtn.disabled = true;
        processBatchBtn.querySelector('.btn-text').style.opacity = '0.5';
        processBatchBtn.querySelector('.spinner').style.display = 'inline-block';

        const startTime = performance.now();

        try {
            let results = [];
            
            if (state.modelLoaded) {
                // Call real FastAPI batch endpoint
                const response = await fetch(`${API_BASE_URL}/batch-predict`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bugs: state.batchBugsData })
                });

                if (response.ok) {
                    const batchResult = await response.json();
                    
                    results = batchResult.predictions.map((pred, idx) => ({
                        bug_id: pred.bug_id,
                        title: state.batchBugsData[idx].title,
                        component: state.batchBugsData[idx].component,
                        severity: state.batchBugsData[idx].severity,
                        predicted_priority: pred.prediction.priority,
                        confidence: pred.prediction.confidence,
                        recommendation: pred.recommendation,
                        reasoning: pred.reasoning,
                        timestamp: pred.timestamp
                    }));
                } else {
                    throw new Error('Batch prediction service failed');
                }
            } else {
                // Fallback local mock simulation
                await new Promise(r => setTimeout(r, 1500)); // Simulate processing delay
                
                results = state.batchBugsData.map((bug, idx) => {
                    let score = 0.5;
                    if (bug.severity === 'critical') score += 2.0;
                    if (bug.severity === 'high') score += 1.2;
                    if (bug.affected_users > 100) score += 0.8;
                    if (bug.is_reproducible) score += 0.5;

                    let mockPriority = 'Low';
                    if (score >= 3.0) mockPriority = 'Critical';
                    else if (score >= 2.0) mockPriority = 'High';
                    else if (score >= 1.0) mockPriority = 'Medium';

                    return {
                        bug_id: `MOCK_B_${idx}_${Date.now().toString().slice(-4)}`,
                        title: bug.title,
                        component: bug.component,
                        severity: bug.severity,
                        predicted_priority: mockPriority,
                        confidence: 0.70 + (Math.random() * 0.25),
                        recommendation: 'Processed mock batch prediction',
                        reasoning: 'Batch mock simulation',
                        timestamp: new Date().toISOString()
                    };
                });
            }

            const latency = performance.now() - startTime;

            // Render stats summary cards
            document.getElementById('batch-summary-total').textContent = state.batchBugsData.length;
            document.getElementById('batch-summary-processed').textContent = results.length;
            document.getElementById('batch-summary-failed').textContent = state.batchBugsData.length - results.length;

            // Render results table
            const batchTableBody = document.querySelector('#batch-results-table tbody');
            batchTableBody.innerHTML = '';
            results.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><code>${row.bug_id}</code></td>
                    <td>${row.title}</td>
                    <td>${row.component}</td>
                    <td>${row.severity}</td>
                    <td><span class="priority-pill priority-${row.predicted_priority.toLowerCase()}">${row.predicted_priority}</span></td>
                    <td><strong>${(row.confidence * 100).toFixed(0)}%</strong></td>
                `;
                batchTableBody.appendChild(tr);
            });

            // Store results in predictions history for metrics
            state.predictionsHistory.push(...results);
            state.totalPredictions += results.length;
            
            const totalConf = state.predictionsHistory.reduce((acc, curr) => acc + curr.confidence, 0);
            state.avgConfidence = totalConf / state.predictionsHistory.length;
            state.avgLatency = ((state.avgLatency * (state.totalPredictions - results.length)) + latency) / state.totalPredictions;

            // Populate Batch Doughnut Chart
            const batchCounts = { Low: 0, Medium: 0, High: 0, Critical: 0 };
            results.forEach(r => batchCounts[r.predicted_priority]++);
            
            const pieData = [batchCounts.Low, batchCounts.Medium, batchCounts.High, batchCounts.Critical];

            if (!chartBatchDist) {
                const ctx = document.getElementById('chart-batch-dist').getContext('2d');
                chartBatchDist = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: ['Low', 'Medium', 'High', 'Critical'],
                        datasets: [{
                            data: pieData,
                            backgroundColor: ['#10b981', '#f59e0b', '#f97316', '#ef4444'],
                            borderWidth: 0,
                            hoverOffset: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 } }
                            }
                        },
                        cutout: '65%'
                    }
                });
            } else {
                chartBatchDist.data.datasets[0].data = pieData;
                chartBatchDist.update();
            }

            // Reveal results
            resultsSummarySection.style.display = 'block';

            // Set up download results link
            setupDownloadResultsButton(results);

            updateDashboardCards();
            updateDashboardCharts();
            updateHistoryTable();
            checkThresholdAlerts();

            showToast(`Processed batch prediction for ${results.length} bugs`, 'success');

        } catch (err) {
            showToast(`Batch processing failed: ${err.message}`, 'error');
            console.error('Batch failed:', err);
        } finally {
            processBatchBtn.disabled = false;
            processBatchBtn.querySelector('.btn-text').style.opacity = '1';
            processBatchBtn.querySelector('.spinner').style.display = 'none';
        }
    });

    function setupDownloadResultsButton(results) {
        btnDownloadResults.onclick = () => {
            let csvContent = 'data:text/csv;charset=utf-8,';
            csvContent += 'bug_id,title,component,severity,predicted_priority,confidence\n';
            
            results.forEach(r => {
                const titleEscaped = `"${r.title.replace(/"/g, '""')}"`;
                csvContent += `${r.bug_id},${titleEscaped},${r.component},${r.severity},${r.predicted_priority},${(r.confidence * 100).toFixed(0)}%\n`;
            });

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);
            link.setAttribute('download', `bug_predictions_${Date.now()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };
    }

    // Template Download Handler
    btnDownloadTemplate.addEventListener('click', () => {
        const csvContent = 'data:text/csv;charset=utf-8,' + 
            'title,description,component,severity,affected_users,is_reproducible\n' +
            '"Login button misaligned on mobile screen","The login button on homepage is cut off on iOS Safari","UI","low",25,false\n' +
            '"Database connection timeout during checkout","Checkout fails with database gateway timed out errors under load","database","critical",400,true\n' +
            '"Cart items disappearing on reload","Items disappear from cart after refreshing the page","cart","medium",50,true\n';
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', 'smart_bug_template.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // --- Model Metrics Tab logic ---
    async function loadModelMetrics() {
        try {
            const response = await fetch(`${API_BASE_URL}/metrics`);
            if (response.ok) {
                const data = await response.json();
                document.getElementById('metric-accuracy').textContent = data.accuracy.toFixed(2);
                document.getElementById('metric-precision').textContent = data.precision.toFixed(2);
                document.getElementById('metric-recall').textContent = data.recall.toFixed(2);
                document.getElementById('metric-f1').textContent = data.f1_score.toFixed(2);
            }
        } catch (err) {
            // Serve mock metrics on connection failure
            document.getElementById('metric-accuracy').textContent = '0.87';
            document.getElementById('metric-precision').textContent = '0.85';
            document.getElementById('metric-recall').textContent = '0.83';
            document.getElementById('metric-f1').textContent = '0.84';
        }
    }

    // --- Alerts & Threshold Limits Config ---
    const alertConfigForm = document.getElementById('alert-thresholds-form');
    
    // Sliders DOM
    const sliders = [
        { el: document.getElementById('threshold-success-rate'), valEl: document.getElementById('val-threshold-success-rate'), suffix: '%' },
        { el: document.getElementById('threshold-latency'), valEl: document.getElementById('val-threshold-latency'), suffix: 'ms' },
        { el: document.getElementById('threshold-confidence'), valEl: document.getElementById('val-threshold-confidence'), suffix: '%' }
    ];

    sliders.forEach(slider => {
        slider.el.addEventListener('input', () => {
            slider.valEl.textContent = `${slider.el.value}${slider.suffix}`;
        });
    });

    alertConfigForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        state.thresholds.successRate = parseInt(document.getElementById('threshold-success-rate').value);
        state.thresholds.latency = parseInt(document.getElementById('threshold-latency').value);
        state.thresholds.confidence = parseInt(document.getElementById('threshold-confidence').value);

        checkThresholdAlerts();
        showToast('Threshold configurations updated successfully', 'success');
    });

    function checkThresholdAlerts() {
        state.activeAlerts = [];

        // Check 1: Latency warning
        if (state.avgLatency > state.thresholds.latency) {
            state.activeAlerts.push({
                severity: 'CRITICAL',
                message: `Avg Latency is at ${state.avgLatency.toFixed(0)}ms (exceeds threshold limit of ${state.thresholds.latency}ms)`,
                time: new Date().toLocaleTimeString()
            });
        }

        // Check 2: Average Confidence check
        if (state.avgConfidence > 0 && (state.avgConfidence * 100) < state.thresholds.confidence) {
            state.activeAlerts.push({
                severity: 'WARNING',
                message: `Model prediction avg confidence is ${(state.avgConfidence * 100).toFixed(1)}% (below SLA limit of ${state.thresholds.confidence}%)`,
                time: new Date().toLocaleTimeString()
            });
        }

        renderAlertsTab();
    }

    function renderAlertsTab() {
        const wrapper = document.getElementById('alerts-list-wrapper');
        const sidebarBadge = document.getElementById('alerts-sidebar-badge');

        // Sidebar badge
        if (state.activeAlerts.length > 0) {
            sidebarBadge.textContent = state.activeAlerts.length;
            sidebarBadge.style.display = 'inline-block';
        } else {
            sidebarBadge.style.display = 'none';
        }

        // List
        if (state.activeAlerts.length === 0) {
            wrapper.innerHTML = `
                <div class="no-alerts-state">
                    <i class="fa-solid fa-circle-check"></i>
                    <h3>System Fully Operational</h3>
                    <p>No active alerts. All performance variables are within normal parameters.</p>
                </div>
            `;
            return;
        }

        wrapper.innerHTML = '';
        state.activeAlerts.forEach(alert => {
            const alertBox = document.createElement('div');
            const isCritical = alert.severity === 'CRITICAL';
            alertBox.className = `alert-item-box ${isCritical ? 'alert-critical-box' : 'alert-warning-box'}`;

            alertBox.innerHTML = `
                <div class="detail-icon">
                    <i class="fa-solid ${isCritical ? 'fa-triangle-exclamation' : 'fa-bell'}"></i>
                </div>
                <div class="alert-item-content">
                    <h4>${alert.severity} Threshold Breach</h4>
                    <p>${alert.message}</p>
                </div>
                <span class="alert-item-time">${alert.time}</span>
            `;
            wrapper.appendChild(alertBox);
        });
    }

    // --- Bootstrapping Initializations ---
    function init() {
        checkSystemHealth();
        loadModelMetrics();
        updateDashboardCharts();
        updateHistoryTable();
        
        // Poll server health every 15 seconds
        setInterval(checkSystemHealth, 15000);
    }

    init();
});
