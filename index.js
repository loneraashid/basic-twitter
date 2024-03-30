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
  following: [],
  followers: [],
});
const tweetsSchema = mongoose.Schema({
  userId: Schema.ObjectId,
  name: String,
  tweet: String,
  timestamp: String,
  likes: {
    type: Number,
    default: 0,
  },
  likedby: [],
  comments: [
    {
      commentby: String,
      name: String,
      comment: String,
      timestamp: String,
    },
  ],
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

app.get("/update-profile", upload.single("photo"), async (req, res) => {
  if (!req.isAuthenticated()) {
    res.redirect("/login");
    return;
  }

  res.render("updateprofile", { user: req.user });
});

app.post("/update-profile", upload.single("photo"), async (req, res) => {
  let url;
  let user = await User.findById(req.user._id);
  try {
    if (req.body.name) {
      await User.findByIdAndUpdate(user._id, {
        name: req.body.name,
      });
    }
    if (req.body.newpassword) {
      await user.changePassword(req.body.oldpassword, req.body.newpassword);
      console.log("password updated succesfully");
    }
    if (req.file) {
      await cloudinary.uploader.destroy(
        req.body.email,
        async function (error, result) {
          if (result) {
            await cloudinary.uploader.upload(
              req.file.path,
              { public_id: req.body.email },
              async function (error, result) {
                if (result) {
                  url = result.secure_url;
                  fs.unlinkSync(req.file.path);
                  await User.findByIdAndUpdate(user._id, {
                    profilePicture: url,
                  });
                  console.log("picture updated successfully");
                }
              }
            );
          }
        }
      );
    }

    res.redirect("/tweets");
  } catch (e) {
    console.log(e);
    console.log("error occured while updating profile");
    res.redirect("/update-profile");
  }
});

app.get("/register", (req, res) => {
  res.render("register");
});
app.post("/register", upload.single("photo"), async (req, res) => {
  let url;
  if (req.file) {
    await cloudinary.uploader.upload(
      req.file.path,
      { public_id: req.body.email },
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
      following: req.user.following,
      followers: req.user.followers,
      id: req.user._id,
      tweets,
      following: req.user.following,
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
    timestamp: Date.now(),
  });
  await tweet.save();
  const updatedTweets = [...tweets, tweet._id];
  await User.findByIdAndUpdate(req.user._id, { tweets: updatedTweets });
  res.redirect("/tweets");
});

app.post("/follow", async (req, res) => {
  const { following } = await User.findById(req.user._id);
  if (!following.includes(req.body.tofollow.trim())) {
    following.push(req.body.tofollow.trim());
    await User.findByIdAndUpdate(req.user._id, { following: following });

    const { followers } = await User.findById(req.body.tofollow.trim());
    followers.push(req.user._id.trim);
    await User.findByIdAndUpdate(req.body.tofollow.trim(), {
      followers: followers,
    });
  }

  res.redirect(req.body.fromPage);
});
app.post("/unfollow", async (req, res) => {
  const { following } = await User.findById(req.user._id);
  if (following.includes(req.body.tofollow.trim())) {
    let index = following.indexOf(req.body.tofollow.trim());
    await following.splice(index, 1);
    await User.findByIdAndUpdate(req.user._id, { following: following });

    const { followers } = await User.findById(req.body.tofollow.trim());
    index = followers.indexOf(req.user._id);
    await followers.splice(index, 1);
    await User.findByIdAndUpdate(req.body.tofollow.trim(), {
      followers: followers,
    });
  }
  res.redirect(req.body.fromPage);
});
app.post("/like", async (req, res) => {
  // console.log(typeof req.body.tweet);
  const tweetid = req.body.tweet.trim();

  let { likes, likedby } = await Tweet.findById(tweetid);
  if (!likedby.includes(req.user._id)) {
    likes++;
    likedby.push(req.user._id);

    await Tweet.findByIdAndUpdate(tweetid, {
      likes,
      likedby,
    });
    res.redirect("/tweets");
    return;
  }
  if (likedby.includes(req.user._id)) {
    likes--;
    const index = likedby.indexOf(req.user._id);
    likedby.splice(index, 1);
    await Tweet.findByIdAndUpdate(tweetid, { likes, likedby });
  }

  res.redirect("/tweets");
});

app.get("/comments/:id", async (req, res) => {
  const path = req.path;
  const id = path.slice(10);
  const tweet = await Tweet.findById(id);

  res.render("comments.ejs", {
    comments: tweet.comments.reverse(),
    user: req.user,
    tweet,
  });
});
app.post("/comment", async (req, res) => {
  if (req.isAuthenticated()) {
    console.log(req.body.tweetId);
    const { comments } = await Tweet.findById(req.body.tweetId);
    const data = {
      commentby: req.user._id,
      name: req.user.name,
      comment: req.body.comment,
    };
    comments.push(data);
    await Tweet.findByIdAndUpdate(req.body.tweetId, {
      comments,
    });
    res.redirect(`/comments/${req.body.tweetId}`);
  } else {
    res.redirect("/login");
  }
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
