# Studying a reference video

When the user supplies videos whose motion they like, study them before writing
the storyboard. A reference is for understanding, never copying: its footage,
logos, layouts, words and music stay with it.

1. **Measure it.** `pitch media probe --file <file>` for length and frame rate,
   then `pitch video analyze --source <file>` for its scene changes: where the
   picture turns over, and how often.
2. **Overview.** `pitch video frames --source <file> --times '[0,1,2,…]'
   --contact_sheet` at about one frame a second (twelve per call). Note what
   leads each stretch and how the scale changes.
3. **Dense around every transition worth learning.** Twelve frames inside about
   0.7 seconds spanning the change (16–20 a second). A transition read from two
   settled frames is a guess; the mechanism is in the frames between: which
   element becomes the next thing, what moves while the ground stays, what
   crosses the cut, where the speed changes. Then build that mechanism.
4. **A note per video** in `direction.md`: its key moment, how that moment
   works, and how the idea could serve this product with this product's own
   objects.
5. **The rules across them.** What holds across the best ones (how they join
   scenes, how long they hold to read, how they set type, what never happens).
   Those rules, not the shapes, go into the storyboard.

Read timings off the sheets' timestamps rather than estimating from playback.
What a reference teaches is a principle (the wipe bar becomes the phone); its
shapes, palette and durations stay with it.
