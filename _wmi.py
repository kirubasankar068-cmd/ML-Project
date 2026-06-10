# Dummy _wmi module to prevent platform.py from loading the built-in WMI module and hanging.
raise ImportError("WMI is disabled to prevent hangs on this system.")
