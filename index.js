import express from "express";
import mongoose, { Schema } from "mongoose";
import bodyParser from "body-parser";
import session from "express-session";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import "dotenv/config";
import fs from "fs";

import passport from "passport";
import passportLocalMongoose from "passport-local-mongoose";

const app = express();
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // destination folder for uploaded files
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname); // filename customization
  },
});

// Set up multer instance
const upload = multer({ storage: storage });
cloudinary.config({
  cloud_name: process.env.CLOUDNAME,
  api_key: process.env.CLOUDAPIKEY,
  api_secret: process.env.CLOUDAPISECRET,
});
const timestamp = Math.round(new Date().getTime() / 1000); // Current timestamp in seconds
const stringToSign = `public_id=image&timestamp=${timestamp}`;

// Generate signature
const signature = cloudinary.utils.api_sign_request(
  stringToSign,
  process.env.CLOUDAPISECRET
);
mongoose
  .connect(process.env.MONGOURI)
  .then(() => {
    console.log("db connected");
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error);
  });
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static("public"));
app.set("view engine", "ejs");

app.use(
  session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

const userSchema = mongoose.Schema({
  name: String,
  email: String,
  password: String,
  profilePicture: String,
  tweets: [],
});
const tweetsSchema = mongoose.Schema({
  userId: Schema.ObjectId,
  name: String,
  tweet: String,
});
userSchema.plugin(passportLocalMongoose, {
  usernameField: "email",
});
const Tweet = mongoose.model("Tweet", tweetsSchema);
const User = mongoose.model("User", userSchema);

passport.use(User.createStrategy());

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.get("/", (req, res) => {
  res.render("index");
});
app.get("/login", (req, res) => {
  res.render("login");
});
app.post("/login", (req, res) => {
  const user = new User({
    email: req.body.email,
    password: req.body.password,
  });
  req.login(user, (e) => {
    if (e) {
      console.log(e);
      res.redirect("/login");
    } else {
      passport.authenticate("local", {
        failureRedirect: "login",
      })(req, res, () => {
        res.redirect("/tweets");
      });
    }
  });
});

app.get("/logout", (req, res) => {
  req.logout((e) => {
    if (e) {
      console.log(e);
    } else {
      res.redirect("/");
    }
  });
});

app.get("/register", (req, res) => {
  res.render("register");
});
app.post("/register", upload.single("photo"), async (req, res) => {
  let url;
  if (req.file) {
    await cloudinary.uploader.upload(
      req.file.path,
      { public_id: "olympic_flag" },
      function (error, result) {
        if (result) {
          url = result.secure_url;
          fs.unlinkSync(req.file.path);
        }
      }
    );
  } else {
    url = `https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Default_pfp.svg/340px-Default_pfp.svg.png`;
  }

  User.register(
    {
      email: req.body.email,
      name: req.body.name,
      profilePicture: url,
    },
    req.body.password,
    function (err, user) {
      if (err) {
        console.log(`from first clg` + err);
        res.redirect("/register");
      } else {
        req.login(user, (e) => {
          if (e) {
            console.log(`from login log` + e);
            res.redirect("/login");
          } else {
            passport.authenticate("local", {
              successRedirect: "tweets",
              failureRedirect: "tweets",
            })(req, res, () => {
              res.redirect("/tweets");
            });
          }
        });
      }
    }
  );
});
app.get("/tweets", async (req, res) => {
  if (req.isAuthenticated()) {
    const tweets = await Tweet.find();
    res.render("tweets", {
      name: req.user.name,
      profile: req.user.profilePicture,
      id: req.user._id,
      tweets,
    });
  } else {
    res.redirect("/login");
  }
});

app.post("/tweets", async (req, res) => {
  const { tweets } = await User.findById(req.user?._id);
  const tweet = new Tweet({
    userId: req.user._id,
    name: req.user.name,
    tweet: req.body.tweet,
  });
  await tweet.save();
  const updatedTweets = [...tweets, tweet._id];
  await User.findByIdAndUpdate(req.user._id, { tweets: updatedTweets });
  res.redirect("/tweets");
});
app.post("/delete-tweet", async (req, res) => {
  const tweet = await Tweet.findById(req.body.tweetId);
  if (req.user._id.toString() === tweet.userId.toString()) {
    await Tweet.findByIdAndDelete(tweet._id);
    const index = req.user.tweets.indexOf(tweet._id);

    const { tweets } = await User.findById(req.user?._id);

    tweets.splice(index, 1);
    await User.findByIdAndUpdate(req.user._id, { tweets });
  }

  res.redirect("/tweets");
});
app.listen(3000, () => {
  console.log("Server is running");
});
