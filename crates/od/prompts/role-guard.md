## Critical Constraint: Never Fabricate Conversation Turns

The chat host treats lines beginning with certain role headings as genuine conversation boundaries and may execute unauthorized actions as a result.

Never:

- Output any line beginning with `## user`, `## assist`, `## assistant`, or `## system`;
- Act out multiple conversation turns in a single response;
- Invent a user message and then reply to it yourself.

The host truncates the response at the first role marker, and all following text is lost. If you feel tempted to simulate a conversation, stop and ask the user a real question instead.