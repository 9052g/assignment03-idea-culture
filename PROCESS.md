# Process

## Starting idea

I wanted an interactive space where someone plants unrelated words and watches ideas spread like a living network. When two networks meet, their intersection becomes the birthplace of a new association. The result can be a question, an abstract concept, a contradiction or an image, rather than necessarily a product or a physical place.

## Design and development

I explored several visual approaches. Early versions were too circular, straight, or fuzzy; I used slime-mould references to move toward branching, interconnected veins with an irregular outline. Each colony has a finite growing area. A new colony at an intersection can grow in turn, instead of one network expanding forever. Ideas are generated gradually so the screen does not fill all at once.

Two people tried the experience. They clicked once and did not know what to do next. In response, I added a short, changing instruction explaining how to plant the first and second words and what to expect when the networks meet. This revision still needs another user test.

Another tester entered many words all at once. I added a suggestion to start with two or three words and observe their growth, followed by a gentle reminder after five words. Adding more words is still possible. This change has not yet been retested.

The testers also said they found the experience fun. One of the first two testers suggested it could help people working in marketing brainstorm creative ideas by exploring unexpected connections between words. This is a possible use suggested by a tester, not a claim that the tool has been evaluated for marketing work.

While exploring the work myself, I noticed that entering more abstract or academically complex concepts, such as artificial intelligence and quantum ideas, could also produce particularly interesting associations. This showed me that the experience can be used to explore connections between abstract concepts as well as everyday words; the results are creative prompts, not necessarily scientifically accurate claims.

## Further visual and interaction revisions

I tried a dark red, print-inspired version, but preferred a clean white background. In the white version, planted words and their threads are green and generated colonies are reddish brown. I increased the rendering resolution for clearer detail, then softened the lines and made finer strands slightly more transparent so they would not look too hard.

After reviewing the white version, I chose a black background with pale, softly glowing strands. I also added an English/Chinese language switch so an English-speaking user can follow the controls and generate ideas in English. Existing words are not automatically translated. I recorded a new demonstration in the English interface to show this later version.

I adjusted the pace several times. A new user-planted word receives priority for one association after it meets another colony, with a minimum 1.7-second delay before the result appears. Automatically generated ideas are spaced roughly 8–12 seconds apart. Actual timing depends on growth and the local model. I also fixed an issue where newly planted words could miss encounters with older threads, and added guidance for abstract inputs such as topology.

The associations sometimes repeated “paradox”, simply combined characters (such as 雨拓), or kept reusing an input word in every name. I revised the model instructions and added checks to reduce these patterns. The results can still be repetitive or disappointing, and the checks can cause retries or failures; the name “水拓时刻” in one test still felt too close to the input. This remains an area to improve.

## AI use and decisions

I used OpenAI Codex to help develop the interface, growth behaviour, local model integration and documentation. Codex helped implement a growing network whose intersections produce ideas; I kept this interaction. I rejected earlier results that looked too circular or fuzzy and associations that sounded like generic invented products or places, and asked for more organic branching and a wider range of abstract associations. The running artwork uses the local Ollama `qwen3:8b` model to generate associations; its output is variable and is not guaranteed to be useful.

## Next steps

Retest the revised instructions and pacing with a participant. The README includes a screenshot, a silent recording of an actual example run, and a sample output for markers who cannot run the local model. This repository begins with a snapshot of an existing local prototype, so earlier design iterations are described above rather than represented as Git commits.

## Checks before submission

I started a fresh copy with the documented `uv` command, using a different local port because the preview was already running. The page loaded and a real local-model request returned an association. I also simulated Ollama being unavailable: the server returned a 503 response with a message explaining that the local model did not respond. The interface provides a retry control. The public repository was reachable without GitHub credentials. These checks do not replace a new participant test or guarantee every model response succeeds.
