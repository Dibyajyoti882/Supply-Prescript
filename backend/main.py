
from fastapi import FastAPI

app = FastAPI(
    title="Supply Prescript API",
    description="Supply chain prediction and decision support system",
    version="1.0.0",
)


@app.get("/")
def home():
    return {
        "message": "Welcome to Supply Prescript API"
    }


@app.get("/health")
def health_check():
    return {
        "status": "ok"
    }
