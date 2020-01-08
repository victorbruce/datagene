const functions = require('firebase-functions');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount.json');
const firebase = require('firebase');
const express = require('express');
const app = express();

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://konnect-4088f.firebaseio.com"
});

firebase.initializeApp({
  apiKey: "AIzaSyBavIsf9J0hWCwTTj3oz-tQLLu62093c7c",
  authDomain: "konnect-4088f.firebaseapp.com",
  databaseURL: "https://konnect-4088f.firebaseio.com",
  projectId: "konnect-4088f",
  storageBucket: "konnect-4088f.appspot.com",
  messagingSenderId: "1003018423062",
  appId: "1:1003018423062:web:3a4fe32e79d4bcd9cf5e37",
  measurementId: "G-TJM2BX5P7H"
})


const db = firebase.firestore();

// helper functions
const isEmail = (email) => {
  const regEx = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  
  if (email.match(regEx)) return true;
  else return false;
}

const isEmpty = (string) => {
  if (string.trim() === '') return true;
  else return false;
}

const FBAuth = (req, res, next) => {
  let idToken;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    idToken = req.headers.authorization.split('Bearer ')[1];
  } else {
    console.log('No token found');
    return res.status(403).json({error: 'Unauthorized'})
  }

  admin.auth().verifyIdToken(idToken)
    .then(decodedToken => {
      req.user = decodedToken;
      console.log(decodedToken);
      return db.collection('users')
      .where('userId', '==', req.user.uid)
      .limit(1)
      .get()
    })
    .then(data => {
      req.user.handle = data.docs[0].data().handle;
      return next();
    })
    .catch(error => {
      console.error(error);
      return res.status(403).json(error)
    })
}

// get screams
app.get('/screams', (req, res) => {
  db.collection('screams').orderBy('createadAt', 'desc').get()
  .then(data => {
    let screams = [];
    data.forEach(doc => {
      screams.push({
        screamId: doc.id,
        body: doc.data().body,
        userHandle: doc.data().userHandle,
        createdAt: doc.data().createdAt
      })
    });
    return res.json(screams);
  }).catch(error =>  console.error('Get screams', error))
})

// create scream
app.post('/scream', FBAuth, (req, res) => {
  if (isEmpty(req.body.body)) {
    return res.status(400).json({body: 'Must not be empty'});
  }
  let scream = {
    body: req.body.body,
    userHandle: req.user.handle,
    createdAt: new Date().toISOString()
  }

  db.collection('screams').add(scream)
  .then(doc => {
    return res.json({message: `document ${doc.id} created successfully`})
  })
  .catch(error => {
    console.error('Create screams', error);
    return res.status(500).json({error: 'something went wrong'});
  })
});




// sign up route
app.post('/signup', (req, res) => {
  const newUser = {
    email: req.body.email,
    password: req.body.password,
    confirmPassword: req.body.confirmPassword,
    handle: req.body.handle
  }

  // TODO: validation
  let errors = {};

  if (isEmpty(newUser.email)) {
    errors.email = 'Must not be empty';
  } else if (!isEmail(newUser.email)) {
    errors.email = 'Must be a valid email address';
  }

  if (isEmpty(newUser.handle)) {
    errors.handle = 'Must not be empty';
  }

  if (isEmpty(newUser.password)) {
    errors.password = 'Must not be empty';
  }

  if (newUser.password !== newUser.confirmPassword) {
    errors.confirmPassword = 'Passwords must match';
  }

  if (Object.keys(errors).length > 0) return res.status(400).json(errors);


  let token, userId;
  db.doc(`/users/${newUser.handle}`).get()
    .then(doc => {
      // check if user handle already exists
      if (doc.exists) {
        return res.status(400).json({ handle: 'this handle is already taken'})
      } else {
        // else create a new user
        return firebase.auth().createUserWithEmailAndPassword(newUser.email, newUser.password)
      }
    })
    .then(data => {
      userId = data.user.uid;
      return data.user.getIdToken();
    })
    .then(idToken => {
      token = idToken;
      const userCredentials = {
        handle: newUser.handle,
        email: newUser.email,
        createdAt: new Date().toISOString(),
        userId
      }
      // persist user to the database
      return db.doc(`/users/${newUser.handle}`).set(userCredentials)
    })
    .then(() => {
      res.status(201).json({token})
    })
    .catch(error => {
      if (error.code === 'auth/email-already-in-use') {
        return res.status(400).json({ email: 'Email is already in use'})
      } else {
        return res.status(500).json({error: error.code})
      }
    })
});

// login route
app.post('/login', (req, res) => {
  const user = {
    email: req.body.email,
    password: req.body.password
  }
  // validation
  let errors = {};

  if (isEmpty(user.email)) {
    errors.email = 'Must not be empty';
  }
  if (isEmpty(user.password)) {
    errors.password = 'Must not be empty';
  }
  if (Object.keys(errors).length > 0) return res.status(400).json(errors);

  firebase.auth().signInWithEmailAndPassword(user.email, user.password)
    .then(data => {
      return data.user.getIdToken();
    })
    .then(token => {
      return res.json(token);
    })
    .catch(error => {
      console.log(error);
      if (error.code === 'auth/invalid-email') {
        res.status(403).json({general: 'Wrong credentials, please try again'});
      } else if (error.code === 'auth/user-not-found') {
        res.status(403).json({general: 'Wrong credentials, please try again'});
      }
      return res.status(500).json({error: error.code});
    })
})

exports.api = functions.https.onRequest(app);