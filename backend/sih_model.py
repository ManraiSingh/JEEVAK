# backend/model.py
import os
from pathlib import Path
from collections import Counter

# ultralytics provides YOLO class
try:
    from ultralytics import YOLO
except Exception as e:
    raise RuntimeError("ultralytics not installed. pip install ultralytics") from e

# cv2 for saving plotted image
try:
    import cv2
except Exception:
    cv2 = None

MODEL = None

def load_model(weights_dir="weights"):
    """
    Load the best.pt or last.pt from weights_dir and return the model object.
    """
    global MODEL
    weights_dir = Path(weights_dir)
    ckpt = weights_dir / "best.pt"
    if not ckpt.exists():
        ckpt = weights_dir / "last.pt"
    if not ckpt.exists():
        # try any .pt file
        pts = list(weights_dir.glob("*.pt"))
        if pts:
            ckpt = pts[0]
    if not ckpt.exists():
        raise FileNotFoundError(f"No checkpoint found in {weights_dir} (expected best.pt/last.pt)")
    MODEL = YOLO(str(ckpt))
    print("✅ Model loaded from:", ckpt)
    return MODEL

def predict_image(model, image_path, output_dir="predicted_results", conf=0.184, imgsz=0, max_det=300):
    """
    Run inference on single image_path using the ultralytics YOLO model.
    Returns:
      counts: dict of class_name -> count
      annotated_path: path to saved annotated image (or "" if failed)
    """
    os.makedirs(output_dir, exist_ok=True)
    # run prediction - returns a list of Results
    results = model.predict(source=str(image_path), conf=conf, imgsz=imgsz, max_det=max_det)
    if len(results) == 0:
        return {}, ""

    res = results[0]

    # Build counts using pandas fallback
    counts = {}
    try:
        df = res.pandas().xyxy[0]   # dataframe with column 'name'
        if 'name' in df.columns:
            counts = df['name'].value_counts().to_dict()
        else:
            counts = {}
    except Exception:
        # fallback: iterate boxes
        names = []
        for box in getattr(res, "boxes", []):
            try:
                cls_idx = int(box.cls.cpu().numpy()) if hasattr(box.cls, "cpu") else int(box.cls)
            except Exception:
                cls_idx = int(box.cls)
            names.append(model.names.get(cls_idx, str(cls_idx)))
        counts = dict(Counter(names))

    # Create annotated image
    annotated_path = os.path.join(output_dir, Path(image_path).stem + "_annot.jpg")
    try:
        # res.plot() returns a numpy array image (BGR)
        im_arr = res.plot()
        if cv2 is not None:
            cv2.imwrite(annotated_path, im_arr)
        else:
            # fallback using PIL
            from PIL import Image
            im = Image.fromarray(im_arr[:, :, ::-1])  # BGR -> RGB
            im.save(annotated_path)
    except Exception as e:
        # fallback: call results.save() then copy last saved file
        try:
            results.save()  # saves under runs/predict/exp*/
            import glob, shutil
            saved = sorted(glob.glob("runs/predict/*/*"), key=os.path.getmtime)
            if saved:
                shutil.copy(saved[-1], annotated_path)
        except Exception as e2:
            print("Could not save annotated image:", e, e2)
            annotated_path = ""

    return counts, annotated_path
