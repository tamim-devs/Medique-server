const express = require("express");
const dontenv = require("dotenv");
dontenv.config();
const cors = require("cors");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.MONGODB_URI;
const app = express();
const PORT = process.env.PORT;

app.use(cors());
app.use(express.json());


const JWKS = createRemoteJWKSet(
  new URL(`${process.env.BETTER_AUTH_URL}/api/auth/jwks`)
);

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: No token provided",
      });
    }

    const token = authHeader.split(" ")[1];

    const { payload } = await jwtVerify(token, JWKS);

    req.user = payload;

    console.log("Authenticated user:", payload);

    next();
  } catch (error) {
    console.error("JWT verification failed:", error.message);

    return res.status(401).json({
      success: false,
      message: "Unauthorized: Invalid or expired token",
    });
  }
};

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const db = client.db("medique");
    const tutorCollection = db.collection("tutor");
    const bookingCollection = db.collection("bookings");

    app.post("/api/add-tutor", verifyToken, async (req, res) => {
      const addtutorData = req.body;
      const result = await tutorCollection.insertOne(addtutorData);
      res.send(result);
    });

  app.get("/api/tutor", async (req, res) => {
  try {
    const { search = "" } = req.query;

    const query = search
      ? {
          $or: [
            {
              name: {
                $regex: search,
                $options: "i",
              },
            },
            {
              subject: {
                $regex: search,
                $options: "i",
              },
            },
          ],
        }
      : {};

    const result = await tutorCollection.find(query).toArray();

    res.json(result);
  } catch (error) {
    console.error("Get tutors error:", error);
 
    res.status(500).json({
      success: false,
      message: "Failed to fetch tutors",
    });
  }
});

app.get('/api/featured',async(req,res)=>{
  const result = await tutorCollection.find().limit(4).toArray()
  res.json(result)
})

    app.get("/api/tutor/:id", async (req, res) => {
      const { id } = req.params;

      const result = await tutorCollection.findOne({ _id: new ObjectId(id) });

      res.json(result);
    });

  app.patch("/api/booking/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID",
      });
    }

    const result = await bookingCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: "cancelled",
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    res.json({
      success: true,
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    console.error("Cancel booking error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to cancel booking",
    });
  }
});

app.delete("/api/tutor/:id", verifyToken, async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");

    const { id } = req.params;

    const result = await tutorCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({
        message: "Tutor not found",
      });
    }

    res.send({
      success: true,
      message: "Tutor deleted successfully",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error(error);

    res.status(500).send({
      success: false,
      message: "Failed to delete tutor",
    });
  }
});

 app.post("/api/booking", verifyToken, async (req, res) => {
  try {
    const bookingData = req.body;

    const { tutorId } = bookingData;

    if (!tutorId) {
      return res.status(400).json({
        success: false,
        message: "Tutor ID is required",
      });
    }

    
    const tutorUpdate = await tutorCollection.updateOne(
      {
        _id: new ObjectId(tutorId),
        totalSlot: { $gt: 0 },
        available: true,
      },
      {
        $inc: {
          totalSlot: -1,
        },
      }
    );

   
    if (tutorUpdate.modifiedCount === 0) {
      return res.status(400).json({
        success: false,
        message: "No available slots left for this tutor.",
      });
    }

  
    const result = await bookingCollection.insertOne({
      ...bookingData,
        studentId: req.user.id,
       status: "booked",
      createdAt: new Date(),
    });

    res.status(201).json({
      success: true,
      message: "Booking created successfully",
      bookingId: result.insertedId,
    });
  } catch (error) {
    console.error("Booking error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create booking",
    });
  }
}); 

app.get("/api/bookings/student/:studentId", 
  verifyToken, 
  async (req, res) => {
  try {
    const { studentId } = req.params;

    const bookings = await bookingCollection
      .find({ studentId })
      .sort({ _id: -1 })
      .toArray();

    res.json(bookings);
  } catch (error) {
    console.error("Get bookings error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
    });
  }
});
app.get("/", (req, res) => {
  res.send("MediQue Server is running 🚀");
});
app.delete("/api/booking/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID",
      });
    }

    const result = await bookingCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    res.json({
      success: true,
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    console.error("Delete booking error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to cancel booking",
    });
  }
});
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
 
// app.listen(PORT, () => {
//   console.log(`server is running ${PORT}`);
// });
module.exports = app;
