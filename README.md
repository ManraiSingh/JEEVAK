# JEEVAK 

**JEEVAK** is a web-based platform for **marine organism detection and ocean health insights**.  
It allows users to upload microscope images of water samples, automatically detect organisms, visualize counts, and interact with an AI chatbot specialized in marine life and plankton health.

---

##  Features

- **Image Upload & Detection**  
  - Upload microscope images of water samples.  
  - AI-powered backend processes the image and detects organisms like phytoplankton, zooplankton, bacteria, and fungi.  
  - Displays annotated images with detected species.

- **Interactive Dashboard**  
  - Real-time summary of detected organisms.  
  - Visual representation with species-level counts and bar charts.  
  - Session-based results with easy export (PDF/PNG).  

- **Smart Chatbot**  
  - Ask questions about marine organisms, ocean health, plankton, algae blooms, etc.  
  - Integrated with backend API for accurate responses.  

- **Gallery & Comparison**  
  - Save past uploads into a gallery.  
  - Compare two images side by side.  
  - Fullscreen viewing for detailed inspection.  

- **Modern UI**  
  - Built with React + Recharts for visualization.  
  - Styled with a custom CSS theme.  
  - Responsive design for desktop and mobile.

---


---

##  Installation & Setup

1 *Clone repo*
```bash
git clone https://github.com/your-username/jeevak.git
cd jeevak
```
2 *Create virtual environment*
```bash
python -m venv venv
source venv/bin/activate   # On Mac/Linux
venv\Scripts\activate      # On Windows
```
3 *Install dependencies*
```bash
pip install -r requirements.txt
```
4 *Run Flask server*
```bash
python app.py
```



