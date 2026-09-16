# Review player perspective

Chess.com-imported games initially orient the board toward the username used to
request the games. The reviewed player appears at the bottom and the opponent
appears at the top, whether the reviewed player has White or Black.

Manual PGNs do not identify a reviewed player and therefore start with White at
the bottom. The **Flip Board** control reverses the current visual orientation
and moves the player identity rows with their physical board sides. Selecting a
different game resets the board to that game's derived initial orientation.

Orientation is presentation state only. The move list remains conventional
White-then-Black score-sheet order, selected plies and reconstructed positions
do not change, sounds continue to use move metadata, and engine evaluations
remain White-relative.
