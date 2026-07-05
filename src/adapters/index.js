// Every board adapter is registered here.
// To add a new board: create src/adapters/<id>.js exporting { exams, lookup }
// (optionally getExams, startSession, needsCaptcha), require it here, and make
// sure src/boards.js has an entry for the board.
module.exports = {
  fbise: require('./fbise'),
  bisep: require('./bisep'),
  bisemdn: require('./bisemdn'),
  biek: require('./biek'),
  bsek: require('./bsek'),
  bisefsd: require('./bisefsd'),
  biselahore: require('./biselahore'),
  bisekt: require('./bisekt'),
};
