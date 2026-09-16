import { NextResponse } from "next/server";

import {
  ChessComServiceError,
  fetchChessComPlayerProfile,
} from "@/lib/sources/chesscom/client";

export async function GET(
  _request: Request,
  context: { params: Promise<{ username: string }> },
) {
  const { username } = await context.params;

  try {
    return NextResponse.json(await fetchChessComPlayerProfile(username));
  } catch (error) {
    if (error instanceof ChessComServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { error: "Unexpected failure retrieving Chess.com profile." },
      { status: 500 },
    );
  }
}
