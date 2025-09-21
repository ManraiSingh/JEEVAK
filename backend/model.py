# backend/model.py
import os
from pathlib import Path
from collections import Counter

try:
    from ultralytics import YOLO
except Exception as e:
    raise RuntimeError("ultralytics not installed. Run: pip install ultralytics") from e

# cv2 for saving plotted image
try:
    import cv2
except Exception:
    cv2 = None

MODEL = None

def load_model(weights_dir="weights"):
    """
    Loads a YOLO checkpoint from weights_dir (best.pt or last.pt or any .pt).
    Returns YOLO model.
    """
    global MODEL
    weights_dir = Path(weights_dir)
    if not weights_dir.exists():
        raise FileNotFoundError(f"weights folder not found: {weights_dir}")

    ckpt = weights_dir / "best.pt"
    if not ckpt.exists():
        ckpt = weights_dir / "last.pt"
    if not ckpt.exists():
        pts = list(weights_dir.glob("*.pt"))
        if pts:
            ckpt = pts[0]
    if not ckpt.exists():
        raise FileNotFoundError(f"No .pt checkpoint found in {weights_dir}")

    MODEL = YOLO(str(ckpt))
    print("✅ Loaded model from:", ckpt)
    return MODEL

def predict_image(model, image_path, output_dir="predicted_results", conf=0.184, imgsz=960, max_det=300):
    """
    Run inference on single image and save annotated image.
    Returns (counts_dict, annotated_image_path_or_empty).
    """
    os.makedirs(output_dir, exist_ok=True)
    # run prediction
    results = model.predict(source=str(image_path), conf=conf, imgsz=imgsz, max_det=max_det)
    if len(results) == 0:
        return {}, ""

    res = results[0]

    # Prefer pandas results (ultralytics)
    counts = {}
    try:
        df = res.pandas().xyxy[0]  # dataframe
        if "name" in df.columns:
            counts = df["name"].value_counts().to_dict()
        else:
            counts = {}
    except Exception:
        # fallback: iterate boxes
        try:
            names = []
            for box in getattr(res, "boxes", []):
                try:
                    cls_idx = int(box.cls.cpu().numpy()) if hasattr(box.cls, "cpu") else int(box.cls)
                except Exception:
                    cls_idx = int(box.cls)
                names.append(model.names.get(cls_idx, str(cls_idx)))
            counts = dict(Counter(names))
        except Exception:
            counts = {}

    annotated_path = ""
    try:
        im_arr = res.plot()
        if im_arr is not None:
            # res.plot returns RGB numpy array (H,W,3) or BGR depending on ultralytics; handle both
            if cv2 is not None:
                # convert RGB->BGR if needed (ultralytics tends to return RGB)
                to_write = im_arr[:, :, ::-1]  # RGB->BGR for cv2
                base = Path(image_path).stem + "_annot.jpg"
                annotated_path = os.path.join(output_dir, base)
                cv2.imwrite(annotated_path, to_write)
            else:
                from PIL import Image
                base = Path(image_path).stem + "_annot.jpg"
                annotated_path = os.path.join(output_dir, base)
                Image.fromarray(im_arr).save(annotated_path)
        else:
            annotated_path = ""
    except Exception as e:
        # fallback: try results.save() and pick the last saved file
        try:
            results.save()
            import glob
            saved = sorted(glob.glob("runs/predict/*/*"), key=os.path.getmtime)
            if saved:
                annotated_path = os.path.join(output_dir, Path(image_path).stem + "_annot.jpg")
                # copy the last saved to annotated_path
                import shutil
                shutil.copy(saved[-1], annotated_path)
        except Exception:
            annotated_path = ""

    return counts, annotated_path
