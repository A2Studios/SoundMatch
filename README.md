# SoundMatch

An algorithmic music discovery engine that generates instant, tailored playlists using the Last.fm and Deezer APIs. Built completely client-side with zero account creation required.

### [Live Demo](https://soundmatchweb.netlify.app)

## Features

* **Instant Discovery:** Input any song or artist to instantly generate a continuous queue of highly accurate, content-filtered recommendations.
* **Rich Playback:** Features instant 30-second audio previews and high-resolution album artwork for every track.
* **The "Daily Mix" Algorithm:** Automatically generates a unique, shuffled playlist based on a user's specific search history, liked tracks, and custom playlists.
* **No sign in required:** All user data (playlists, likes, and history) is managed securely via the browser's persistent localStorage.

## Tech Stack

* **Frontend:** Vanilla JavaScript (ES6+), HTML5, Advanced CSS3 (Flexbox/Grid/Variables)
* **APIs:**
  * [Last.fm API](https://www.last.fm/api) (Content-based filtering & track similarity)
  * [Deezer API](https://developers.deezer.com/api) (Audio previews & high-res metadata)
* **Architecture:** Object-Oriented Programming (OOP), Asynchronous State Management
* **Storage:** Client-Side localStorage API

## Under the Hood (Technical Highlights)

Building a robust music platform purely on the client side presented unique engineering challenges:

* **Bypassing CORS Limitations:** Standard `fetch()` requests to the Deezer API fail on frontend-only apps due to strict Cross-Origin Resource Sharing (CORS) rules. We engineered a custom JSONP (JSON with Padding) injection script to securely retrieve data directly from Deezer, avoiding the need for a proxy server.
* **Data Normalization:** Music metadata is notoriously messy. We implemented custom Regex parsing to strip extraneous tags (e.g., `(feat. XYZ)` or `[Remix]`) from Last.fm data before passing it to Deezer, drastically improving search accuracy and artwork matching.
* **Rate-Limit Optimization:** To prevent API throttling, the application utilizes asynchronous staggering and intelligent fallbacks to ensure smooth, non-blocking UI rendering.

## 💻 Running Locally

Because SoundMatch is entirely client-side, running it locally takes seconds. No backend configuration or package managers are required.

1. Clone the repository:
   ```bash
   git clone [https://github.com/A2Studios/SoundMatch.git](https://github.com/A2Studios/SoundMatch.git)

2. Navigate to the project directory: cd SoundMatch

3. Open index.html in your preferred web browser.

Built by [Anjali](https://www.linkedin.com/in/anjali-harikrishnan) & [Abhinav](https://www.linkedin.com/in/abhinav-khanna06) — A2 Studios
