export class InvalidFenError extends Error {
  constructor(message = "The FEN is not a legal chess position.") {
    super(message);
    this.name = "InvalidFenError";
  }
}

export class EngineInitializationError extends Error {
  constructor(message = "Stockfish could not be initialized.") {
    super(message);
    this.name = "EngineInitializationError";
  }
}

export class EngineAnalysisError extends Error {
  constructor(message = "Stockfish analysis failed.") {
    super(message);
    this.name = "EngineAnalysisError";
  }
}

export class EngineTimeoutError extends Error {
  constructor(message = "Stockfish analysis timed out.") {
    super(message);
    this.name = "EngineTimeoutError";
  }
}
