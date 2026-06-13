import os
import json
import logging
import pandas as pd
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class FileProcessor:
    """Processes uploaded files (CSV, XLSX, JSON, LOG, TXT) and parses them into structured bug schemas"""
    
    def process_file(self, file_path: str, filename: str) -> List[Dict[str, Any]]:
        """
        Parses the uploaded file into a list of standardized bug dictionaries
        
        Args:
            file_path: Absolute path to the saved file
            filename: Original file name
            
        Returns:
            List of dicts containing title, description, component, severity, etc.
        """
        ext = os.path.splitext(filename)[1].lower()
        logger.info(f"Processing file {filename} with extension {ext}")
        
        bugs = []
        
        if ext == ".csv":
            bugs = self._parse_csv(file_path)
        elif ext in [".xlsx", ".xls"]:
            bugs = self._parse_excel(file_path)
        elif ext == ".json":
            bugs = self._parse_json(file_path)
        elif ext in [".log", ".txt"]:
            bugs = self._parse_log_or_txt(file_path, filename)
        else:
            raise ValueError(f"Unsupported file format: {ext}")
            
        # Clean and validate bugs list
        validated_bugs = []
        for idx, bug in enumerate(bugs):
            cleaned = self._sanitize_bug(bug, idx)
            validated_bugs.append(cleaned)
            
        return validated_bugs
        
    def _parse_csv(self, file_path: str) -> List[Dict[str, Any]]:
        """Parses CSV to dict list, automatically finding headers"""
        try:
            df = pd.read_csv(file_path, encoding='utf-8', on_bad_lines='skip')
            logger.info(f"CSV loaded: {len(df)} rows, columns: {df.columns.tolist()}")
            return self._map_dataframe(df)
        except UnicodeDecodeError:
            try:
                df = pd.read_csv(file_path, encoding='latin-1', on_bad_lines='skip')
                return self._map_dataframe(df)
            except Exception as e:
                logger.error(f"Failed to parse CSV (latin-1): {e}")
                raise ValueError(f"Invalid CSV structure: {e}")
        except Exception as e:
            logger.error(f"Failed to parse CSV: {e}")
            raise ValueError(f"Invalid CSV structure: {e}")
            
    def _parse_excel(self, file_path: str) -> List[Dict[str, Any]]:
        """Parses Excel using openpyxl engine"""
        try:
            df = pd.read_excel(file_path)
            return self._map_dataframe(df)
        except Exception as e:
            logger.error(f"Failed to parse Excel: {e}")
            raise ValueError(f"Invalid Excel structure: {e}")
            
    def _parse_json(self, file_path: str) -> List[Dict[str, Any]]:
        """Parses JSON file containing list of bugs or single bug"""
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                
            if isinstance(data, list):
                return data
            elif isinstance(data, dict):
                # Check if it contains a 'bugs' array
                if "bugs" in data and isinstance(data["bugs"], list):
                    return data["bugs"]
                return [data]
            else:
                raise ValueError("JSON must contain an array or single bug object")
        except Exception as e:
            logger.error(f"Failed to parse JSON: {e}")
            raise ValueError(f"Invalid JSON format: {e}")
            
    def _parse_log_or_txt(self, file_path: str, filename: str) -> List[Dict[str, Any]]:
        """Parses log files, trying to identify separate error blocks"""
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
                
            # Scan for stack traces
            # Split by common log line indicators if present, or split by line
            lines = content.split("\n")
            
            # Simple heuristic: scan for lines starting with timestamps + severity (e.g. ERROR, CRITICAL)
            error_blocks = []
            current_block = []
            
            error_pattern = re_compile = r"(error|critical|fatal|exception|fail)"
            
            for line in lines:
                if any(ind in line.lower() for ind in ["[error]", "[fatal]", "[critical]", "error:", "exception:"]):
                    if current_block:
                        error_blocks.append("\n".join(current_block))
                        current_block = []
                current_block.append(line)
                
            if current_block:
                error_blocks.append("\n".join(current_block))
                
            # If we didn't identify separate error blocks, treat whole file as one report
            if len(error_blocks) <= 1:
                return [{
                    "title": f"Log Trace: {filename}",
                    "description": content[:4000], # Cap size
                    "severity": "high" if "error" in content.lower() or "exception" in content.lower() else "medium",
                    "component": "System Logs"
                }]
                
            bugs = []
            for idx, block in enumerate(error_blocks[:20]): # Cap log reports to top 20
                if any(keyword in block.lower() for keyword in ["error", "fatal", "critical", "exception"]):
                    first_line = block.strip().split("\n")[0]
                    # truncate first line if it's too long
                    title = first_line[:120] if len(first_line) > 120 else first_line
                    bugs.append({
                        "title": title or f"Log Block Exception #{idx+1}",
                        "description": block[:3000],
                        "severity": "high" if "fatal" in block.lower() or "critical" in block.lower() else "medium",
                        "component": "Log Engine"
                    })
            return bugs
        except Exception as e:
            logger.error(f"Failed to parse log file: {e}")
            raise ValueError(f"Invalid LOG file format: {e}")
            
    def _map_dataframe(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """Finds closest matching columns and converts dataframe to standard dictionary structure"""
        # Normalise column names: lowercase, strip whitespace
        df.columns = [str(c).lower().strip() for c in df.columns]
        cols = df.columns.tolist()
        logger.info(f"Normalised columns: {cols}")

        title_col = self._find_match(cols, ["title", "summary", "name", "subject", "bug_title"]) or cols[0]
        desc_col  = self._find_match(cols, ["description", "desc", "details", "body", "bug_description"]) or (cols[1] if len(cols) > 1 else cols[0])
        sev_col   = self._find_match(cols, ["severity", "sev", "type", "priority", "level"])
        comp_col  = self._find_match(cols, ["component", "module", "area", "service", "system"])
        users_col = self._find_match(cols, ["affected_users", "users", "impact", "user_count"])
        rep_col   = self._find_match(cols, ["is_reproducible", "reproducible", "repro", "reproduce"])
        steps_col = self._find_match(cols, ["steps_to_reproduce", "steps", "repro_steps", "reproduction"])
        role_col  = self._find_match(cols, ["user_role", "reporter", "reported_by", "role", "submitter"])
        env_col   = self._find_match(cols, ["environment", "env", "platform"])

        bugs = []
        for _, row in df.iterrows():
            def safe(col: str, default: str = '') -> str:
                if col and col in df.columns and pd.notna(row[col]):
                    return str(row[col]).strip()
                return default

            sev_raw = safe(sev_col, 'medium').lower()
            # Map common priority labels → severity scale
            sev_map = {
                'critical': 'critical', 'blocker': 'critical', 'p0': 'critical',
                'high': 'high', 'major': 'high', 'p1': 'high',
                'medium': 'medium', 'normal': 'medium', 'moderate': 'medium', 'p2': 'medium',
                'low': 'low', 'minor': 'low', 'trivial': 'low', 'p3': 'low', 'p4': 'low',
            }
            severity = sev_map.get(sev_raw, 'medium')

            bug = {
                "title":       safe(title_col, f"Bug #{_ + 1}"),
                "description": safe(desc_col, "No description provided."),
                "severity":    severity,
                "component":   safe(comp_col, "General"),
                "steps_to_reproduce": safe(steps_col, ""),
                "reported_by": safe(role_col, "system"),
                "environment": safe(env_col, "Production"),
                "module":      safe(comp_col, "General"),
                "is_reproducible": True,
            }

            if users_col:
                try:
                    bug["affected_users"] = int(float(safe(users_col, '1')))
                except (ValueError, TypeError):
                    bug["affected_users"] = 1

            if rep_col:
                val = safe(rep_col, 'true').lower()
                bug["is_reproducible"] = val in ["true", "1", "yes", "y"]

            bugs.append(bug)

        logger.info(f"Mapped {len(bugs)} bugs from dataframe")
        return bugs
        
    def _find_match(self, cols: List[str], targets: List[str]) -> str:
        """Finds matches between targets and column list"""
        for target in targets:
            for col in cols:
                if target in col.lower():
                    return col
        return None
        
    def _sanitize_bug(self, bug: Dict[str, Any], index: int) -> Dict[str, Any]:
        """Ensures all fields conform to Pydantic rules and sets reasonable fallbacks"""
        title = str(bug.get("title") or f"Bug Report #{index + 1}").strip()
        desc  = str(bug.get("description") or "No description provided.").strip()

        # Minimum length guard for Pydantic validators
        if len(title) < 5:
            title = f"{title} (Bug Report #{index + 1})"
        if len(desc) < 10:
            desc = f"{desc} — reported issue #{index + 1} requires investigation."

        severity = str(bug.get("severity") or "medium").lower().strip()
        if severity not in ["low", "medium", "high", "critical"]:
            severity = "medium"

        cleaned = {
            "title":              title[:500],
            "description":        desc[:5000],
            "severity":           severity,
            "component":          str(bug.get("component") or "General").strip()[:100],
            "affected_users":     max(1, int(bug.get("affected_users") or 1)),
            "is_reproducible":    bool(bug.get("is_reproducible", True)),
            "reported_by":        str(bug.get("reported_by") or "system")[:100],
            "environment":        str(bug.get("environment") or "Production")[:100],
            "module":             str(bug.get("module") or "General")[:100],
            "steps_to_reproduce": str(bug.get("steps_to_reproduce") or "")[:2000],
        }

        logger.debug(f"Sanitized bug #{index + 1}: title='{cleaned['title'][:40]}' severity={cleaned['severity']}")
        return cleaned

file_processor = FileProcessor()
