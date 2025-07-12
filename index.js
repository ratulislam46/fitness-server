require('dotenv').config()
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const port = process.env.PORT || 3000;

// middleware 
app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ibgq1ve.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        await client.connect();

        const usersCollection = client.db('fitnest').collection('users');
        const subscribersCollection = client.db('fitnest').collection('subscribers');
        const TrainersCollection = client.db('fitnest').collection('trainers');
        const RejectTrainersCollection = client.db('fitnest').collection('rejected_trainer');

        // users info save in db 
        app.post('/users', async (req, res) => {
            const email = req.body.email;
            const UserExists = await usersCollection.findOne({ email })
            if (UserExists) {
                return res.status(400).send({ message: 'User already exists' })
            }
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result)
        })

        // Post Subcribers
        app.post('/subscribers', async (req, res) => {
            const { name, email } = req.body;
            if (!name || !email) {
                return res.status(400).json({ message: 'Name and email required' });
            }
            try {
                const existing = await subscribersCollection.findOne({ email });
                if (existing) {
                    return res.status(409).json({ message: 'Already subscribed' });
                }
                const result = await subscribersCollection.insertOne({
                    name,
                    email,
                    subscribed_at: new Date(),
                });
                res.status(201).json({ message: 'Subscribed successfully' });
            } catch (error) {
                console.error('Subscription error:', error);
                res.status(500).json({ message: 'Server error' });
            }
        });

        // get subcribers list
        app.get('/subscribers', async (req, res) => {
            const result = await subscribersCollection.find().toArray();
            res.send(result);
        });

        // post applied trainer 
        app.post("/applied-trainers", async (req, res) => {
            const trainerData = req.body;
            const result = await TrainersCollection.insertOne(trainerData);
            res.send(result);
        });

        // get all trainers 
        app.get('/trainers/pending', async (req, res) => {
            const trainers = await TrainersCollection.find({ status: "pending" }).toArray();
            res.send(trainers);
        });

        // get all trainer at userscollection in db 
        app.get("/trainers/all", async (req, res) => {
            try {
                const result = await usersCollection.find({ role: 'trainer' }).toArray()
                res.send(result)
            }
            catch (error) {
                res.status(500).send({ message: "Error fetching trainers" });
            }
        });

        // get singel trainer by trainer id
        app.get('/trainers/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const trainer = await TrainersCollection.findOne(query);
            res.send(trainer)
        });

        // update user role and trainer status 
        app.patch('/trainers/status/:id', async (req, res) => {
            const id = req.params.id;
            const { status, email } = req.body;
            const query = { _id: new ObjectId(id) };
            const updateDoc = { $set: { status: status } }
            try {
                const result = await TrainersCollection.updateOne(query, updateDoc);
                if (status === 'confirm') {
                    const trainerQuery = { email };
                    const trainerUpdateDoc = { $set: { role: 'trainer' } }
                    const trainerRole = await usersCollection.updateOne(trainerQuery, trainerUpdateDoc);
                }
                res.send(result)
            }
            catch (error) {
                res.status(500).send({ message: 'Error updating trainer status', error })
            }
        })

        app.patch('/trainer/change-role/:id', async (req, res) => {
            const trainerId = req.params.id;
            const { email } = req.body;

            try {
                const result = await usersCollection.updateOne(
                    { _id: new ObjectId(trainerId) },
                    { $set: { role: "member" } }
                );
                res.send(result)
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: "Error updating role." });
            }
        })

        // rejected trainer info save in another collection 
        app.post("/trainer-rejections", async (req, res) => {
            try {
                const rejectionData = req.body;

                // Validation (optional)
                if (!rejectionData.trainerId || !rejectionData.email || !rejectionData.feedback) {
                    return res.status(400).json({ message: "Missing required rejection data." });
                }

                const result = await RejectTrainersCollection.insertOne(rejectionData);
                res.status(201).json({ message: "Trainer rejection saved." });
            } catch (error) {
                console.error("Error saving trainer rejection:", error);
                res.status(500).json({ message: "Server error while rejecting trainer." });
            }
        });

        app.delete("/trainers/delete/:id", async (req, res) => {
            try {
                const trainerId = req.params.id;
                const query = { _id: new ObjectId(trainerId) }
                const result = await TrainersCollection.deleteOne(query);

                if (result.deletedCount === 1) {
                    res.json({ message: "Trainer deleted from pending list." });
                } else {
                    res.status(404).json({ message: "Trainer not found." });
                }
            } catch (error) {
                console.error("Error deleting trainer:", error);
                res.status(500).json({ message: "Server error while deleting trainer." });
            }
        });






        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Fitnest server is runing!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
