# HabiTrack

A full-stack real estate web application with Aadhaar identity verification, MongoDB Atlas persistence, JWT authentication, and a responsive React UI.

---

## Folder Structure

```
habittrack/
│
├── backend/                        # Node.js + Express API server
│   ├── models/                     # Mongoose data models
│   │   ├── User.js                 # User schema (with Aadhaar fields)
│   │   ├── Property.js             # Property listing schema
│   │   ├── Chat.js                 # Chat thread + messages schema
│   │   ├── Contact.js              # Contact form submission schema
│   │   └── Transaction.js          # Buy/rent transaction schema
│   │
│   ├── routes/                     # Express route handlers
│   │   ├── auth.js                 # Register, login, reset password, Aadhaar OTP
│   │   ├── user.js                 # Profile update, saved properties
│   │   ├── properties.js           # Property CRUD + image upload
│   │   ├── chat.js                 # Chat threads and messages
│   │   ├── contact.js              # Contact form
│   │   └── transactions.js         # Buy/rent transactions
│   │
│   ├── uploads/                    # User-uploaded images (served statically)
│   ├── index.js                    # App entry point, MongoDB connection
│   ├── package.json
│   ├── .env                        # Environment variables (not committed)
│   └── .env.example                # Template for environment variables
│
├── UI/                             # React + Vite frontend
│   ├── public/                     # Static assets (icons, images)
│   │
│   ├── src/
│   │   ├── components/             # Reusable UI components
│   │   │   ├── card/               # Property card
│   │   │   ├── chat/               # Chat widget
│   │   │   ├── filter/             # Search filter
│   │   │   ├── list/               # Property list
│   │   │   ├── map/                # Leaflet map
│   │   │   ├── pin/                # Map pin
│   │   │   ├── searchBar/          # Search bar
│   │   │   ├── slider/             # Image slider
│   │   │   ├── NavBar.jsx          # Top navigation bar
│   │   │   └── navbar.scss
│   │   │
│   │   ├── context/
│   │   │   └── AuthContext.jsx     # Global auth state (user, login, logout)
│   │   │
│   │   ├── lib/                    # API utility functions
│   │   │   ├── api.js              # Auth + Aadhaar API calls
│   │   │   ├── userApi.js          # User profile API calls
│   │   │   ├── propertyApi.js      # Property API calls
│   │   │   ├── chatApi.js          # Chat API calls
│   │   │   ├── contactApi.js       # Contact form API calls
│   │   │   ├── transactionApi.js   # Transaction API calls
│   │   │   ├── agentsData.js       # Static agents data
│   │   │   ├── dummydata.js        # Fallback/demo data
│   │   │   └── locationFormatter.js
│   │   │
│   │   ├── routes/                 # Page-level route components
│   │   │   ├── aadhaarVerify/      # Aadhaar OTP verification page
│   │   │   ├── about/              # About us page
│   │   │   ├── agents/             # Agents listing + profile
│   │   │   ├── contact/            # Contact form page
│   │   │   ├── forgotPassword/     # Password reset page
│   │   │   ├── homepage/           # Landing page
│   │   │   ├── layout/             # App shell layout (navbar + outlet)
│   │   │   ├── listPage/           # Property search results
│   │   │   ├── notifications/      # Notifications page
│   │   │   ├── profilePage/        # User profile + property management
│   │   │   ├── signIn/             # Sign in page
│   │   │   ├── signUp/             # Sign up page
│   │   │   └── singlePage/         # Single property detail page
│   │   │
│   │   ├── App.jsx                 # Router configuration
│   │   ├── main.jsx                # React entry point (wraps AuthProvider)
│   │   ├── index.scss              # Global styles
│   │   ├── layout.scss             # Root layout styles
│   │   └── responsive.scss         # Breakpoint mixins
│   │
│   ├── index.html
│   ├── vite.config.js              # Vite config + dev proxy to backend
│   └── package.json
│
├── .gitignore                      # Ignores node_modules, .env, uploads, dist
└── README.md                       # This file
```

---

## Quick Start

### 1. Configure backend environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
```env
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net/habittrack
JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
PORT=5000
NODE_ENV=development
```

### 2. Install & run backend

```bash
cd backend
npm install
npm start
```

### 3. Install & run frontend

```bash
cd UI
npm install
npm run dev
```

App runs at `http://localhost:5173`, API at `http://localhost:5000`.

---

## Key Features

- JWT authentication (register / login / forgot password)
- Aadhaar identity verification (OTP-based, 2-step flow)
- Property listings with map view (Leaflet / OpenStreetMap)
- Property create, edit, delete with image uploads
- Save / unsave properties
- Real-time-style chat between users
- Buy / rent transactions
- Responsive design (mobile, tablet, desktop)
- MongoDB Atlas for all persistent data

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router v7, SCSS |
| Maps | Leaflet, React-Leaflet |
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas, Mongoose |
| Auth | JWT (jsonwebtoken), bcryptjs |
| File uploads | Multer |
| Environment | dotenv |
