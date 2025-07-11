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

        // POST Subcriber
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
            const trainers = await TrainersCollection.find({status:"pending"}).toArray();
            res.send(trainers);
        });

        // get singel trainer by trainer id
        app.get('/trainers/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const trainer = await TrainersCollection.findOne(query);
            res.send(trainer)
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
