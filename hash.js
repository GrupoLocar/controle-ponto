// hash.js
const bcrypt = require('bcrypt');
bcrypt.hash('senha123', 10)
  .then(hash => console.log(hash))
  .catch(err => console.error(err));

  