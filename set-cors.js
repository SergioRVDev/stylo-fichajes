const admin = require('firebase-admin');
const serviceAccount = require('C:/Users/Ramos/Downloads/sumabelleza-app-firebase-adminsdk-fbsvc-0954145f94.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'sumabelleza-app.firebasestorage.app' // Extraído del log de error del usuario
});

const bucket = admin.storage().bucket();

const corsConfiguration = [
  {
    origin: ['*'], // Permite peticiones desde cualquier origen (ej. localhost:3000)
    method: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    maxAgeSeconds: 3600,
    responseHeader: ['Content-Type', 'Authorization', 'Content-Length', 'User-Agent', 'x-goog-resumable', 'x-firebase-storage-version']
  }
];

bucket.setCorsConfiguration(corsConfiguration)
  .then(() => {
    console.log('¡Configuración CORS en Firebase Storage aplicada con éxito!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error configurando CORS:', err);
    process.exit(1);
  });
