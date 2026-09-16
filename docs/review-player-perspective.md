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

## Responsive review layout

The opponent row, board, and reviewed-player row form one board stack. Its
board is constrained by both column width and dynamic viewport height, with a
40rem desktop maximum. On wide screens the review sidebar uses the remaining
viewport height and scrolls independently, so long analysis or move history
does not stretch the board column.

At widths up to 980px the page becomes a single column and ordinary page
scrolling places analysis below the intact board stack. A 16rem board is the
practical minimum, including mobile landscape and effective small viewports
created by browser zoom. Below the 32rem desktop-height threshold, page
scrolling is intentionally preferred to shrinking pieces further. `dvh` is
used for changing mobile browser chrome, with `vh` retained as the desktop page
height fallback for browsers that do not support dynamic viewport units.
