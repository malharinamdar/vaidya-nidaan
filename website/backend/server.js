const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const doctorAuthRoutes = require('./routes/doctorRoutes');
const patientRoutes = require('./routes/patientRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/doctor', doctorAuthRoutes); 
app.use('/api/patient', patientRoutes);  

const dotenv = require('dotenv');
dotenv.config();

mongoose.connect(process.env.MONGO_URI, { 
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));


const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
