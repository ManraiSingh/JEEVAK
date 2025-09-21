
import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
load_dotenv()
from model import load_model, predict_image
from chatbot import chat_reply

# ------------------- Config -------------------
UPLOAD_FOLDER = "predicted_results"
TEMP_FOLDER = "temp_uploads"
ALLOWED_EXT = {"png", "jpg", "jpeg", "tif", "tiff"}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(TEMP_FOLDER, exist_ok=True)

app = Flask(
    __name__,
    static_folder="../frontend/dist",   # serve React build
    static_url_path="/"
)
CORS(app)

# ------------------- Load Model -------------------
try:
    MODEL = load_model("weights")
except Exception as e:
    MODEL = None
    MODEL_LOAD_ERR = str(e)
else:
    MODEL_LOAD_ERR = None


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXT


# ------------------- Health Check -------------------
@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model_loaded": MODEL is not None,
        "model_error": MODEL_LOAD_ERR
    })


# ------------------- Predict Endpoint -------------------
@app.route("/predict", methods=["POST"])
def predict():
    if MODEL is None:
        return jsonify({"error": "model not loaded", "detail": MODEL_LOAD_ERR}), 500

    if "file" not in request.files:
        return jsonify({"error": "no file uploaded"}), 400

    file = request.files["file"]
    if file.filename == "" or not allowed_file(file.filename):
        return jsonify({"error": "invalid file"}), 400

    filename = secure_filename(file.filename)
    tmp_path = os.path.join(TEMP_FOLDER, filename)
    file.save(tmp_path)

    counts_raw, annotated_path = predict_image(MODEL, tmp_path, output_dir=UPLOAD_FOLDER)

    annotated_url = ""
    if annotated_path:
        annotated_url = request.host_url.rstrip("/") + "/predicted/" + os.path.basename(annotated_path)

    try:
        os.remove(tmp_path)
    except Exception:
        pass

    return jsonify({
        "counts_raw": counts_raw,
        "annotated_image_url": annotated_url
    })


# ------------------- Chat Endpoint -------------------
@app.route("/chat", methods=["POST"])
def chat_endpoint():
    try:
        data = request.get_json(force=True, silent=True) or {}
        text = data.get("text") if isinstance(data, dict) else None
        if not text:
            return jsonify({"error": "no text provided"}), 400

        reply = chat_reply(text)
        return jsonify({"reply": reply})
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        return jsonify({"error": "internal", "detail": str(e), "traceback": tb}), 500


# ------------------- Serve Predicted Images -------------------
@app.route("/predicted/<path:filename>")
def serve_predicted(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


# ------------------- Run -------------------
if __name__ == "__main__":
    port = int(os.getenv("PORT", 5175))
    app.run(host="0.0.0.0", port=port, debug=True)