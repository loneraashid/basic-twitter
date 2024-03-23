import express from "express";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import session from "express-session";
import passport from "passport";
import passportLocalMongoose from "passport-local-mongoose";

const app = express();
mongoose
  .connect(
    "mongodb+srv://alpha:Loneraashid2@cluster0.8bl0b3t.mongodb.net/tweetsDB?retryWrites=true&w=majority"
  )
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
    secret: "tweets-app",
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

  tweets: [],
});

userSchema.plugin(passportLocalMongoose, {
  usernameField: "email",
});
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
app.post("/register", (req, res) => {
  User.register(
    { email: req.body.email, name: req.body.name },
    req.body.password,
    function (err, user) {
      if (err) {
        console.log(err);
        res.redirect("/register");
      } else {
        req.login(user, (e) => {
          if (e) {
            console.log(e);
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
    res.render("tweets", {
      name: req.user.name,
      tweets: req.user.tweets,
    });
  } else {
    res.redirect("/login");
  }
});

app.post("/tweets", async (req, res) => {
  const { tweets } = await User.findById(req.user?._id);
  const updatedTweets = [...tweets, req.body.tweet];
  await User.findByIdAndUpdate(req.user._id, { tweets: updatedTweets });
  res.redirect("/tweets");
});
app.post("/delete-tweet", async (req, res) => {
  const { tweets } = await User.findById(req.user._id);
  tweets.splice(req.body.index, 1);
  await User.findByIdAndUpdate(req.user._id, { tweets: tweets });
  res.redirect("/tweets");
});
app.listen(3000, () => {
  console.log("Server is running");
});
