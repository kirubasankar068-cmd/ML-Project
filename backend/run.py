import sys
import os
import uvicorn

# Get the path to the workspace root (parent directory of backend)
backend_dir = os.path.dirname(os.path.abspath(__file__))
workspace_root = os.path.abspath(os.path.join(backend_dir, ".."))

# Add workspace root to sys.path and PYTHONPATH so that Python can find the 'backend' package
sys.path.insert(0, workspace_root)
os.environ["PYTHONPATH"] = workspace_root + os.pathsep + os.environ.get("PYTHONPATH", "")

if __name__ == "__main__":
    print(f"Starting uvicorn from backend/run.py")
    print(f"Workspace root: {workspace_root}")
    print(f"Watching directory for changes: {backend_dir}")
    
    # Run uvicorn pointing to backend.app.main:app, reloading when files change
    uvicorn.run(
        "backend.app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=[backend_dir]
    )
