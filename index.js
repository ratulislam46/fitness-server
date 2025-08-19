require('dotenv').config()
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin");
const app = express()
const port = process.env.PORT || 3000;

const stripe = require('stripe')(process.env.PAYMENT_GETEWAY_KEY);


// middleware 
app.use(cors());
app.use(express.json());


const decodedKey = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decodedKey);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ibgq1ve.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: false,
        deprecationErrors: true,
    }
});

async function run() {
    try {

        const usersCollection = client.db('fitnest').collection('users');
        const subscribersCollection = client.db('fitnest').collection('subscribers');
        const TrainersCollection = client.db('fitnest').collection('trainers');
        const RejectTrainersCollection = client.db('fitnest').collection('rejected_trainer');
        const forumsCollection = client.db('fitnest').collection('forums');
        const classesCollection = client.db('fitnest').collection('classes');
        const slotsCollection = client.db('fitnest').collection('slots');
        const paymentsCollection = client.db('fitnest').collection('payments');
        const reviewsCollection = client.db('fitnest').collection('reviews');


        // middleware 
        const verifyFBToken = async (req, res, next) => {

            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).send({ message: 'unauthorized access' })
            }
            const token = authHeader.split(' ')[1]
            if (!token) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            // verify the token 
            try {
                const decoded = await admin.auth().verifyIdToken(token);
                req.decoded = decoded;
                next()
            }
            catch (error) {
                return res.status(403).send({ message: 'forbidden access' })
            }
        }

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const user = await usersCollection.findOne({ email })
            if (!user || user.role !== 'admin') {
                return res.status(403).send({ message: 'fobidden access' })
            }
            next()
        }

        const verifyTrainer = async (req, res, next) => {
            const email = req.decoded.email;
            const user = await usersCollection.findOne({ email })
            if (!user || user.role !== 'trainer') {
                return res.status(403).send({ message: 'forbidden acess' })
            }
            next()
        }

        const verifyMember = async (req, res, next) => {
            const email = req.decoded.email;
            const user = await usersCollection.findOne({ email })
            if (!user || user.role !== 'member') {
                return res.status(403).send({ message: 'forbidden acess' })
            }
            next()
        }

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

        app.get('/users/:email/role', async (req, res) => {
            const email = req.params.email;
            try {
                if (!email) {
                    res.status(400).send({ message: 'Email is required' })
                }
                const user = await usersCollection.findOne({ email });
                if (!user) {
                    res.status(404).send({ message: 'User not found' })
                }
                res.send({ role: user.role || 'member' })
            }
            catch (error) {
                res.status(500).send({ message: 'Failed to get role' })
            }
        })

        // get users by user own email 
        app.get('/users/:email', verifyFBToken, async (req, res) => {
            const email = req.params.email;
            const result = await usersCollection.findOne({ email });
            res.send(result);
        })

        // user info update in db 
        app.patch('/users/profile/:email', async (req, res) => {
            try {
                const email = req.params.email;
                const UpdateData = req.body;
                const filter = { email: email }
                const updateDoc = {
                    $set: {
                        name: UpdateData.name,
                        image: UpdateData.photoURL,
                        last_login: new Date().toISOString()
                    }
                }
                const result = await usersCollection.updateOne(filter, updateDoc);
                res.send(result)
            }
            catch (error) {
                console.error('Error updating user profile:', error);
                res.status(500).send({ message: 'user profile updated error' });
            }
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
        app.get('/subscribers', verifyFBToken, verifyAdmin, async (req, res) => {
            const result = await subscribersCollection.find().toArray();
            res.send(result);
        });

        // post applied trainer 
        app.post("/applied-trainers", async (req, res) => {
            const trainerData = req.body;
            const result = await TrainersCollection.insertOne(trainerData);
            res.send(result);
        });

        // get trainer whoes status is confirm
        app.get("/trainers", async (req, res) => {
            const status = req.query.status || "confirm";
            const trainers = await TrainersCollection.find({ status }).toArray();
            res.send(trainers);
        });

        app.get('/team-trainers', async (req, res) => {
            const trainers = await TrainersCollection
                .find({ status: 'confirm' })
                .sort({ paymentDate: -1 })
                .limit(3)
                .toArray();
            res.send(trainers)
        })

        // get all trainers 
        app.get('/trainers/pending', verifyFBToken, verifyAdmin, async (req, res) => {
            const trainers = await TrainersCollection.find({ status: "pending" }).toArray();
            res.send(trainers);
        });

        // get all trainer at userscollection in db 
        app.get("/trainers/all", verifyFBToken, verifyAdmin, async (req, res) => {
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

        // trainer role change 
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

        // trainer delete from pending trainer list 
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

        // get rejected trainer 
        app.get("/trainer-applications/rejected/:email", verifyFBToken, async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const result = await RejectTrainersCollection.find(query).toArray();
            res.send(result);
        });

        // get trainer application status pending
        app.get("/trainer-applications/pending/:email", verifyFBToken, async (req, res) => {
            const email = req.params.email;
            const query = { email, status: "pending" };
            const result = await TrainersCollection.find(query).toArray();
            res.send(result);
        });

        // forum post by admin or trainer
        app.post('/forums', async (req, res) => {
            const forum = req.body;
            const result = await forumsCollection.insertOne(forum);
            res.send(result);
        })

        // get latest 6 forums
        app.get("/forums/latest", async (req, res) => {
            try {
                const forums = await forumsCollection.find()
                    .sort({ created_at: -1 })
                    .limit(6)
                    .toArray();

                res.send(forums);
            } catch (err) {
                res.status(500).send({ message: "Failed to fetch forums" });
            }
        });

        // get latest 6 forums
        app.get("/latest-classes", async (req, res) => {
            try {
                const forums = await classesCollection.find()
                    .sort({ created_at: -1 })
                    .limit(6)
                    .toArray();

                res.send(forums);
            } catch (err) {
                res.status(500).send({ message: "Failed to fetch forums" });
            }
        });

        // get all forums 
        app.get('/all/forums/routes', async (req, res) => {
            try {
                const forums = await forumsCollection.find().sort({ created_at: -1 }).toArray();
                res.send(forums);
            } catch (err) {
                res.status(500).send({ message: "Failed to fetch forums" });
            }
        })

        // get forum by forum id and show forum details
        app.get('/forum-details/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const forum = await forumsCollection.findOne(query)
            res.send(forum)
        })

        // patch update forums up-vote and down-vote
        app.patch('/forums/vote/:id', async (req, res) => {
            const forumId = req.params.id;
            const { vote, userEmail } = req.body;

            if (!userEmail) {
                return res.status(400).send({ message: "User email is required" });
            }

            try {
                const forum = await forumsCollection.findOne({ _id: new ObjectId(forumId) });

                if (!forum) {
                    return res.status(404).send({ message: "Forum not found" });
                }

                let updatedVotes = forum.votes || [];

                const alreadyVoted = updatedVotes.find(v => v.email === userEmail);

                if (vote === "vote" && !alreadyVoted) {
                    updatedVotes.push({ email: userEmail });
                } else if (vote === "cancelVote" && alreadyVoted) {
                    updatedVotes = updatedVotes.filter(v => v.email !== userEmail);
                }

                const result = await forumsCollection.updateOne(
                    { _id: new ObjectId(forumId) },
                    {
                        $set: {
                            votes: updatedVotes,
                            count: updatedVotes.length
                        }
                    }
                );

                res.send(result);
            } catch (error) {
                console.error("Vote update error:", error);
                res.status(500).send({ message: "Internal server error" });
            }
        });

        // post classes info 
        app.post("/classes", async (req, res) => {
            const classesData = req.body;
            const result = await classesCollection.insertOne(classesData)
            res.send(result)
        })

        // GET /classes?search=Yoga&page=1&limit=6
        app.get('/classes', async (req, res) => {
            const { search = '', page = 1, limit = 6 } = req.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);

            const query = search
                ? { title: { $regex: search, $options: 'i' } }
                : {};

            const total = await classesCollection.countDocuments(query);
            const result = await classesCollection
                .find(query)
                .skip(skip)
                .sort({ created_at: -1 })
                .limit(parseInt(limit))
                .toArray();

            res.send({ result, total });
        });

        // get trainers-by-skill
        app.get('/trainers-by-skill/:className', async (req, res) => {
            const className = req.params.className;
            const trainers = await TrainersCollection.find({
                skills: { $in: [className] },
                status: 'confirm'
            }).limit(5).toArray();

            res.send(trainers);
        });

        // get admin added all class need add a new slow
        app.get('/admin-added-classes', verifyFBToken, async (req, res) => {
            const result = await classesCollection.find().toArray();
            res.send(result)
        })

        // GET trainer by email
        app.get('/trainers-by-email/:email', async (req, res) => {
            const trainer = await TrainersCollection.findOne({ email: req.params.email });
            res.send(trainer);
        });

        // get all slots by trainerId
        app.get('/slots', async (req, res) => {
            const slots = await slotsCollection.find({ trainerId: req.query.trainerId }).toArray();
            res.send(slots);
        });

        //  Add this route in your server file (e.g., index.js or slotRoutes.js)
        app.get('/slots-in-trainer', async (req, res) => {
            try {
                const email = req.query.email;
                const trainerId = req.query.trainerId;

                const query = {};
                if (email) query.trainerEmail = email;
                if (trainerId) query.trainerId = trainerId;

                const slots = await slotsCollection.find(query).toArray();

                res.send(slots);
            } catch (err) {
                console.error('Error fetching slots:', err);
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });

        // get slots by trainerEmail
        app.get("/slots-by-email/:trainerEmail", verifyFBToken, async (req, res) => {
            const trainerEmail = req.params.trainerEmail;
            try {
                const result = await slotsCollection.find({ trainerEmail }).toArray();
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: "Failed to fetch slots" });
            }
        });

        app.get('/slots/:id', async (req, res) => {
            const id = req.params.id;
            try {
                const slot = await slotsCollection.findOne({ _id: new ObjectId(id) });
                if (!slot) {
                    return res.status(404).send({ message: 'Slot not found' })
                }
                res.send(slot)
            }
            catch (err) {
                res.status(500).send({ err: 'Server error' })
            }
        });

        // post new slot
        app.post('/slots', async (req, res) => {
            const result = await slotsCollection.insertOne(req.body);
            res.send(result);
        });

        // delete /slots/:id
        app.delete("/slots/:id", async (req, res) => {
            const id = req.params.id;
            try {
                const result = await slotsCollection.deleteOne({ _id: new ObjectId(id) });
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: "Failed to delete slot" });
            }
        });

        // payment method api 
        app.post("/create-payment-intent", async (req, res) => {
            try {
                const { price } = req.body;
                const amount = parseInt(price * 100);

                const paymentIntent = await stripe.paymentIntents.create({
                    amount,
                    currency: "usd",
                    payment_method_types: ["card"],
                });

                res.send({ clientSecret: paymentIntent.client_secret });
            } catch (error) {
                console.error("Error creating payment intent:", error);
                res.status(500).send({ message: "Failed to create payment intent" });
            }
        });

        // last six payment data get 
        app.get("/api/recent-payments", async (req, res) => {
            try {
                const recentPayments = await paymentsCollection
                    .find()
                    .sort({ paymentDate: -1 })
                    .limit(6)
                    .toArray();

                res.send(recentPayments);
            } catch (error) {
                console.error("Error fetching recent payments:", error);
                res.status(500).send({ message: "Internal server error" });
            }
        });

        app.post("/payments", async (req, res) => {
            try {
                const paymentInfo = req.body;

                // Check if user already paid for this slot
                const alreadyPaid = await paymentsCollection.findOne({
                    userEmail: paymentInfo.userEmail,
                    slotId: paymentInfo.slotId,
                });

                if (alreadyPaid) {
                    return res.status(400).send({ message: "You already booked this slot." });
                }

                const result = await paymentsCollection.insertOne(paymentInfo);
                res.send(result);
            } catch (error) {
                console.error("Error saving payment:", error);
                res.status(500).send({ message: "Failed to save payment info" });
            }
        });

        app.patch("/slots/:id/increment", async (req, res) => {
            try {
                const slotId = req.params.id;
                const filter = { _id: new ObjectId(slotId) };

                const updateDoc = {
                    $inc: { bookingCount: 1 },
                };

                const result = await slotsCollection.updateOne(filter, updateDoc);
                res.send(result);
            } catch (error) {
                console.error("Error updating slot booking count:", error);
                res.status(500).send({ message: "Failed to update booking count" });
            }
        });

        // all price sumation 
        app.get("/api/total-balance", async (req, res) => {
            try {
                const total = await paymentsCollection.aggregate([
                    {
                        $group: {
                            _id: null,
                            totalBalance: { $sum: "$price" }
                        }
                    }
                ]).toArray();

                const totalAmount = total[0]?.totalBalance || 0;
                res.send({ totalBalance: totalAmount });
            } catch (err) {
                console.error("Error calculating balance", err);
                res.status(500).send({ message: "Error calculating balance" });
            }
        });

        app.get('/admin/chart-data', async (req, res) => {
            try {
                const subscribersCount = await subscribersCollection.estimatedDocumentCount();

                const paidMembers = await paymentsCollection.distinct("userEmail");

                res.send({
                    subscribers: subscribersCount || 0,
                    paidMembers: paidMembers.length || 0
                });
            } catch (error) {
                // console.error(error);
                res.status(500).send({ error: "Server error" });
            }
        });

        // member dashboard data 
        app.get('/member/chart/data', async (req, res) => {
            try {
                const totalSubscribers = await subscribersCollection.estimatedDocumentCount();
                const totalClass = await classesCollection.estimatedDocumentCount();
                const totalForum = await forumsCollection.estimatedDocumentCount();
                const totalTrainers = await usersCollection.countDocuments({ role: 'trainer' });
                const totalMembers = await usersCollection.countDocuments({ role: 'member' });
                res.send({
                    totalSubscribers: totalSubscribers || 0,
                    totalClass: totalClass || 0,
                    totalForum: totalForum || 0,
                    totalTrainers: totalTrainers || 0,
                    totalMembers: totalMembers || 0,
                })
            }
            catch (error) {
                res.status(500).send({ error: "Server error" });
            }
        })

        app.get("/booked-slots", async (req, res) => {
            const userEmail = req.query.email;

            if (!userEmail) {
                return res.status(400).send({ message: "Email is required" });
            }

            try {
                // Step 1: Get all payments for this user
                const userPayments = await paymentsCollection
                    .find({ userEmail })
                    .toArray();

                // Step 2: Extract all slotIds
                const slotIds = userPayments.map(payment => new ObjectId(payment.slotId));

                // Step 3: Find slot details from slot collection
                const slots = await slotsCollection
                    .find({ _id: { $in: slotIds } })
                    .toArray();

                // Optional: you can also send both payment and slot details
                res.send({ slots });
            } catch (error) {
                console.error("Error getting booked slots:", error);
                res.status(500).send({ message: "Server error" });
            }
        });

        app.post("/reviews", async (req, res) => {
            const review = req.body;
            const result = await reviewsCollection.insertOne(review);
            res.send(result);
        });

        app.get('/customer-review', async (req, res) => {
            const data = await reviewsCollection.find().toArray();
            res.send(data)
        })

        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    }
    finally {

    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Fitnest server is runing!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
