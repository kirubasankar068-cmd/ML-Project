"""
Shared Bug Severity Level Mapper & Configuration.
Provides standard percentage-to-severity level mapping and color styling.
0-59   = Very Low    (Gray)
60-69  = Low         (Green)
70-75  = Medium      (Yellow)
76-85  = High Medium (Orange)
86-100 = High        (Red)
"""

from typing import Dict, Any

def map_severity_score(score: float) -> Dict[str, Any]:
    """
    Maps a severity percentage score (0-100) to a severity level, badge color,
    and formatted display string.
    """
    try:
        score_val = float(score)
    except (ValueError, TypeError):
        score_val = 50.0

    score_val = max(0.0, min(100.0, score_val))
    rounded_score = int(round(score_val))

    if rounded_score <= 59:
        level = "Very Low"
        color = "gray"
        bg_class = "bg-slate-100 text-slate-700 border-slate-300"
        badge_style = {"background": "#f1f5f9", "color": "#334155", "border": "1px solid #cbd5e1"}
    elif rounded_score <= 69:
        level = "Low"
        color = "green"
        bg_class = "bg-emerald-50 text-emerald-700 border-emerald-300"
        badge_style = {"background": "#ecfdf5", "color": "#047857", "border": "1px solid #a7f3d0"}
    elif rounded_score <= 75:
        level = "Medium"
        color = "yellow"
        bg_class = "bg-amber-50 text-amber-700 border-amber-300"
        badge_style = {"background": "#fffbeb", "color": "#b45309", "border": "1px solid #fde68a"}
    elif rounded_score <= 85:
        level = "High Medium"
        color = "orange"
        bg_class = "bg-orange-50 text-orange-700 border-orange-300"
        badge_style = {"background": "#fff7ed", "color": "#c2410c", "border": "1px solid #fed7aa"}
    else:
        level = "High"
        color = "red"
        bg_class = "bg-rose-50 text-rose-700 border-rose-300"
        badge_style = {"background": "#fff1f2", "color": "#be123c", "border": "1px solid #fecdd3"}

    formatted = f"{rounded_score}% - {level}"

    return {
        "score": rounded_score,
        "level": level,
        "color": color,
        "formatted": formatted,
        "bg_class": bg_class,
        "badge_style": badge_style
    }
