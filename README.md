# Vaidya Nidaan
*'Vaidya Nidaan' translates from Sanskrit as "Medical Diagnosis".*

> 🏅 **3rd Place** (among 400+ teams) at PICT Techfiesta 2025 Hackathon

![Project Logo](docs/images/op1.jpeg)

> **Vaidya Nidaan** is an AI-powered diagnostic assistance system for Alzheimer’s detection using MRI scans, biomarker extraction with FSL, and explainability via Grad-CAM. The platform integrates VGG-19 for classification, FSL for biomarker computation, and GPT-4-turbo for an interactive multilingual chatbot (English, Hindi, Marathi, any regional Indian language).

---

## 🔍 Features

- **MRI Classification**: 95 % accuracy Alzheimer’s detection with a fine-tuned VGG-19 model.
- **Explainability**: Grad-CAM++ heatmap overlays highlight impacted regions.
- **Biomarker Extraction**: Automated volume metrics & statistical biomarkers via FSL.
- **Multilingual Chatbot**: GPT-4-turbo RAG chatbot supporting English, Hindi, and Marathi.
- **Scalable Storage**: Multer for local uploads & Cloudinary for cloud-based image hosting.
- **Secure Backend**: Node.js API with JWT auth in HTTP-only cookies and PostgreSQL via Prisma.

---

## 📦 Repository Structure

```text
vaidya-nidaan/
├── docs/
│   └── images/                             # Output screenshots for README
│       ├── app.jpeg                        # App flow snapshot
│       ├── arc.jpeg                        # System architecture diagram
│       ├── cb.jpeg                         # Biomarker report snippet
│       ├── grm.png                         # Grad-CAM heatmap
│       └── op1.jpeg                        # Project banner/logo
├── website/                                # End-to-end web UI + API
│   ├── backend/                            # Node.js/Express server
│   │   ├── middleware/                     # Authentication, error handling
│   │   ├── models/                         # Prisma models & DB interactions
│   │   ├── routes/                         # API route handlers
│   │   ├── utils/                          # Cloudinary, Multer, GPT-4 client
│   │   ├── package-lock.json
│   │   ├── package.json                    # Server dependencies & scripts
│   │   └── server.js                       # Express entrypoint
│   └── frontend/                           # React + Vite application
│       ├── public/                         # Static assets (favicon, index.html)
│       ├── src/                            # React components & hooks
│       ├── README.md                       # Frontend-specific instructions
│       ├── eslint.config.js
│       ├── index.html
│       ├── package-lock.json
│       ├── package.json                    # Frontend dependencies & scripts
│       └── vite.config.js
├── MRI_blackandwhite copy.png              # Sample input scan
├── chatbot+rag.ipynb                       # RAG‑chat integration notebook
├── feature_image_model.py                  # Feature‑extraction implementation
├── final_alzheimer_model.ipynb             # Model training & evaluation
├── gradcam++.py                            # Grad‑CAM++ heatmap logic
├── medical_report3.txt                     # Example combined FSL report
├── report.ipynb                            # Automated medical‑report notebook
└── report1.py                              # Python script to generate text reports
```  

---

## 🚀 Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/malharinamdar/vaidya-nidaan.git
   cd vaidya-nidaan
   ```

2. **Backend (Node.js API)**

   ```bash
   cd website/backend
   npm install
   cp .env.example .env
   # Set your environment variables in .env:
   # CLOUDINARY_URL, JWT_SECRET, DATABASE_URL, GPT4_API_KEY
   npx prisma migrate deploy
   ```

3. **Frontend (React + Vite)**

   ```bash
   cd ../frontend
   npm install
   npm run dev     # Starts the frontend at http://localhost:3000
   ```

4. **Global Dependencies**

   - **FSL** (FMRIB Software Library): Install & configure per [official docs](https://fsl.fmrib.ox.ac.uk/fsl/fslwiki/FslInstallation).
   - **Node.js** 14+ & **npm**
   - **Python** 3.8+ & **pip** (for notebooks and scripts).

---

## ⚙️ Configuration

Populate environment variables in `website/backend/.env`:

```ini
CLOUDINARY_URL=cloudinary://<key>:<secret>@<cloud_name>
DATABASE_URL=postgresql://user:pass@host:port/dbname
JWT_SECRET=your_jwt_secret
GPT4_API_KEY=sk-...
```

Ensure `FSLDIR` is set in your shell environment for script-based report generation:

```bash
export FSLDIR=/usr/local/fsl
export PATH="$FSLDIR/bin:$PATH"
```

---

## 💻 Running the Application

1. **Start the backend API**

   ```bash
   cd website/backend
   npm run start    # or npm run dev for hot-reload
   ```

2. **Start the frontend**

   ```bash
   cd website/frontend
   npm run dev
   ```

- **Backend**: `http://localhost:4000`  
- **Frontend**: `http://localhost:3000`

---

## 🛠️ Usage Examples

### 1. Upload MRI & Retrieve Diagnosis

```bash
curl -X POST "http://localhost:4000/api/v1/scan/analyze" \
  -H "Authorization: Bearer <your_jwt_token>" \
  -F "scan=@/path/to/scan.img" \
  -F "hdr=@/path/to/scan.hdr"
```

**Sample JSON Response**:
```json
{
  "alzheimer_probability": 0.87,
  "biomarkers": {
    "hippocampus_volume": 2800.5,
    "ventricular_size": 450.2
  },
  "heatmap_url": "https://res.cloudinary.com/.../grm.png",
  "report_url": "https://res.cloudinary.com/.../medical_report3.txt"
}
```

#### Sample Inputs & Outputs

**Input MRI Scan**

![MRI Input Sample](MRI_blackandwhite%20copy.png)

**Grad-CAM Heatmap**

![Heatmap Overlay](docs/images/grm.png)

**Chatbot Interface**

![Multilingual Chatbot](docs/images/cb.jpeg)

---

## 🔧 System Architecture

![Architecture Diagram](docs/images/arc.jpeg)
```mermaid
flowchart LR
  subgraph Frontend/UI
    U[User Interface]
  end
  U -->|Upload Scan| A[Node.js API]
  A -->|Invoke ML| B[VGG-19 & Grad-CAM]
  A -->|Invoke FSL| C[FSL Service]
  B --> D[Heatmap Image]
  C --> E[Biomarker Report]
  D & E --> F[Cloudinary]
  F --> G[Accessible URLs]
  G --> U
  U -->|Chat Query| H[GPT-4-turbo Chatbot]
  H --> U
```  

---

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---
## 📬 Contact

**Team MarkerMinds AI**

**Team Members:**
- Malhar Inamdar (Maintainer of this repo) – <malhar.inamdar.097@gmail.com>  
- Manorama Mudgal  
- Vedant Joshi  
- Prajwal Mandlecha  
- Aditya Bhalgat  

🌐 Web: [malharinamdar.github.io](https://malharinamdar.github.io)
