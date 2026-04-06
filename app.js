class SoundMatchApp {
    constructor() {
        this.API_KEY = '625c660a10a09e81311110c719fe25d8';
        this.playlist = [];
        this.currentIndex = 0;
        this.audioPlayer = new Audio();
        this.playlistManager = new PlaylistManager();
        this.isPlaying = false;
        this.currentPlaylistId = null; // Track which playlist is loaded (null = discovery)


        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        console.log("SoundMatch Init - Library Mode");
        this.renderLibrary();
        this.initEventListeners();
        if (window.innerWidth > 1024) {
            const input = document.getElementById('songInput');
            if (input) input.focus();
        }
    }

    initEventListeners() {
        const artistInput = document.getElementById('artistInput');
        if (artistInput) {
            artistInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.startDiscovery();
            });
        }
        const songInput = document.getElementById('songInput');
        if (songInput) {
            songInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.startDiscovery();
            });
        }
        this.audioPlayer.addEventListener('ended', () => this.stopAudio());
        this.audioPlayer.addEventListener('error', (e) => {
            console.error("Audio Error", e);
            this.showStatus("❌ Audio playback failed", 'error');
            this.stopAudio();
        });
        // Close picker on outside click
        document.addEventListener('click', (e) => {
            const picker = document.getElementById('playlistPicker');
            const btn = document.getElementById('addToPlaylistBtn');
            if (picker && picker.style.display !== 'none' && !picker.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                this.hidePlaylistPicker();
            }
        });

        // ─── KEYBOARD SHORTCUTS ────────────────
        document.addEventListener('keydown', (e) => {
            // Don't capture when typing in inputs
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;

            const appLayout = document.getElementById('appLayout');
            if (!appLayout || !appLayout.classList.contains('active')) return;

            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    this.toggleAudio();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.nextSong();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.prevSong();
                    break;
                case 'l':
                case 'L':
                    this.toggleLike();
                    break;
                case 's':
                case 'S':
                    if (this.currentPlaylistId) this.shufflePlaylist();
                    break;
            }
        });
    }

    // ─── DISCOVERY ─────────────────────────

    async startDiscovery() {
        const songInput = document.getElementById('songInput');
        const artistInput = document.getElementById('artistInput');
        const song = songInput.value.trim();
        const artist = artistInput.value.trim();
        const deepCutEl = document.getElementById('deepCutToggle');
        const isDeepCut = deepCutEl ? deepCutEl.checked : false;

        if (!song || !artist) {
            this.showStatus('❌ Please enter both a song and artist.', 'error');
            return;
        }

        this.showStatus('<i class="fas fa-spinner fa-spin"></i> Finding matches...', 'loading');

        // Track the search for Daily Mix
        this.playlistManager.addSearch(artist, song);

        try {
            let uniqueTracks = await this.fetchSimilarTracks(artist, song, isDeepCut);

            if (uniqueTracks.length < 5) {
                this.showStatus('✨ Widening search...', 'loading');
                const moreTracks = await this.fetchSimilarArtistsTracks(artist);
                uniqueTracks = [...uniqueTracks, ...moreTracks];
            }

            this.playlist = uniqueTracks
                .filter((v, i, a) => a.findIndex(t => t.name === v.name) === i)
                .map(t => this.formatTrack(t));

            if (this.playlist.length === 0) throw new Error('No results');

            this.currentPlaylistId = null; // Discovery mode

            // Transition UI
            const searchSection = document.getElementById('searchSection');
            const appLayout = document.getElementById('appLayout');
            searchSection.style.transform = 'translateY(-100vh)';
            searchSection.style.opacity = '0';
            searchSection.style.pointerEvents = 'none';
            appLayout.classList.add('active');
            appLayout.removeAttribute('inert');
            document.getElementById('resetBtn').style.display = 'flex';

            this.loadSong(0);
        } catch (error) {
            console.error(error);
            this.showStatus('❌ No matches found. Try another song/artist.', 'error');
        }
    }

    async fetchSimilarTracks(artist, song, isDeepCut) {
        const limit = isDeepCut ? 60 : 30;
        const url = `https://ws.audioscrobbler.com/2.0/?method=track.getsimilar&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(song)}&api_key=${this.API_KEY}&format=json&limit=${limit}&autocorrect=1`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("API Failure");
        const data = await response.json();
        let rawTracks = data.similartracks?.track || [];
        let uniqueTracks = rawTracks.filter(track =>
            track.artist.name.toLowerCase() !== artist.toLowerCase() && track.name
        );
        if (isDeepCut && uniqueTracks.length > 15) uniqueTracks = uniqueTracks.slice(10);
        return uniqueTracks;
    }

    async fetchSimilarArtistsTracks(artist) {
        try {
            const similarUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=${encodeURIComponent(artist)}&api_key=${this.API_KEY}&format=json&limit=5`;
            const simRes = await fetch(similarUrl);
            const simData = await simRes.json();
            if (simData.similarartists?.artist) {
                const promises = simData.similarartists.artist.map(async (sim) => {
                    const top = await fetch(`https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(sim.name)}&api_key=${this.API_KEY}&format=json&limit=2`);
                    const d = await top.json();
                    return d.toptracks?.track || [];
                });
                return (await Promise.all(promises)).flat();
            }
        } catch (e) {
            console.warn("Deep search failed", e);
        }
        return [];
    }

    formatTrack(track) {
        let matchScore = Math.floor(Math.random() * 15) + 80; // default
        if (track.match) {
            matchScore = this.boostMatchScore(parseFloat(track.match));
        }
        return {
            title: track.name,
            artist: track.artist?.name || track.artist || 'Unknown',
            match: matchScore,
            previewUrl: track.previewUrl || null,
            artworkUrl: track.artworkUrl || null,
            genre: track.genre || null
        };
    }

    // Boost raw API match scores (often 0.01-1.0) into a friendlier 70-99 range
    boostMatchScore(raw) {
        if (raw > 1) return Math.min(99, Math.round(raw)); // already a percentage
        if (raw <= 0) return Math.floor(Math.random() * 15) + 75;
        // Map 0.01-1.0 into 70-99 using a curve that compresses the low end upward
        const boosted = 70 + Math.round(raw * 29);
        return Math.min(99, Math.max(70, boosted));
    }

    // ─── PLAYBACK ──────────────────────────

    async loadSong(index) {
        if (index < 0) index = this.playlist.length - 1;
        if (index >= this.playlist.length) index = 0;
        this.currentIndex = index;
        const track = this.playlist[index];

        this.stopAudio();
        this.audioPlayer.src = "";

        const imgEl = document.getElementById('displayImage');
        const vibeEl = document.getElementById('displayVibe');
        const titleEl = document.getElementById('displayTitle');
        const artistEl = document.getElementById('displayArtist');

        titleEl.textContent = track.title;
        artistEl.textContent = track.artist;

        const matchVal = track.match != null ? track.match : 85;
        document.getElementById('displayMatch').textContent = matchVal + '%';
        vibeEl.textContent = this.getVibeText(matchVal);
        document.getElementById('displayGenre').style.display = 'none';

        this.updateLikeButton();
        this.updateRightPanel();

        imgEl.style.opacity = '0.5';

        const updateBackground = (url) => {
            const bg = document.getElementById('dynamicBg');
            if (bg) bg.style.backgroundImage = `url('${url}')`;
        };

        // Clear previous preview URL to prevent playing old audio
        track.previewUrl = null;

        try {
            const deezerData = await this.fetchDeezerMeta(track.artist, track.title);
            
            if (deezerData) {
                const highResUrl = deezerData.album.cover_xl;
                
                track.artworkUrl = highResUrl;
                imgEl.src = highResUrl;
                
                imgEl.onerror = () => {
                    imgEl.src = `https://placehold.co/500x500/1a1a2e/aaa?text=${encodeURIComponent(track.title.slice(0, 12))}`;
                    imgEl.style.opacity = '1';
                };
                imgEl.onload = () => imgEl.style.opacity = '1';
                updateBackground(highResUrl);

                if (deezerData.preview) track.previewUrl = deezerData.preview;
            } else {
                imgEl.src = `https://placehold.co/500x500/1a1a2e/aaa?text=${encodeURIComponent(track.title.slice(0, 12))}`;
                imgEl.onload = () => imgEl.style.opacity = '1';
            }
        } catch (e) {
            console.error(e);
            imgEl.src = `https://placehold.co/500x500/1a1a2e/aaa?text=Error`;
            imgEl.style.opacity = '1';
        }

        // Only fetch related tracks in discovery mode
        if (!this.currentPlaylistId) {
            this.loadRelatedTracks(track.artist, track.title);
        }

        this.playlistManager.addToHistory(track);
        this.renderLibrary();
    }

    toggleAudio() {
        const track = this.playlist[this.currentIndex];
        const btn = document.getElementById('playBtn');
        if (!track.previewUrl) {
            this.showStatus("⏭ No preview — skipping to next", 'error');
            setTimeout(() => this.nextSong(), 800);
            return;
        }
        if (this.isPlaying) {
            this.stopAudio();
        } else {
            this.audioPlayer.src = track.previewUrl;
            this.audioPlayer.volume = 0.5;
            this.audioPlayer.play().catch(e => console.error(e));
            this.isPlaying = true;
            btn.innerHTML = '<i class="fas fa-pause"></i>';
            btn.style.transform = "scale(1.1)";
        }
    }

    stopAudio() {
        this.audioPlayer.pause();
        this.audioPlayer.currentTime = 0;
        this.isPlaying = false;
        const btn = document.getElementById('playBtn');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-play"></i>';
            btn.style.transform = "scale(1)";
        }
    }

    nextSong() { this.loadSong(this.currentIndex + 1); }
    prevSong() { this.loadSong(this.currentIndex - 1); }

    // ─── RIGHT PANEL (Similar vs Up Next) ──

    updateRightPanel() {
        const titleEl = document.getElementById('rightPanelTitle');
        const shuffleBtn = document.getElementById('shuffleBtn');

        if (this.currentPlaylistId) {
            // Contextual header based on playlist type
            if (this.currentPlaylistId === 'history') {
                titleEl.textContent = 'HISTORY';
                shuffleBtn.style.display = 'none';
            } else if (this.currentPlaylistId === 'liked') {
                titleEl.textContent = 'LIKED SONGS';
                shuffleBtn.style.display = 'inline-flex';
            } else {
                titleEl.textContent = 'UP NEXT';
                shuffleBtn.style.display = 'inline-flex';
            }
            this.renderUpNext();
        } else {
            // Discovery mode
            titleEl.textContent = 'SIMILAR';
            shuffleBtn.style.display = 'none';
        }
    }

    renderUpNext() {
        const list = document.getElementById('relatedList');
        if (!list) return;
        list.innerHTML = '';

        const upcoming = this.playlist
            .map((t, i) => ({ ...t, _idx: i }))
            .filter((_, i) => i !== this.currentIndex);

        if (upcoming.length === 0) {
            list.innerHTML = '<div class="placeholder-text">No more tracks in playlist.</div>';
            return;
        }

        // Sort so tracks after current come first, then wrap around
        const after = upcoming.filter(t => t._idx > this.currentIndex);
        const before = upcoming.filter(t => t._idx < this.currentIndex);
        const ordered = [...after, ...before];

        ordered.forEach((t, idx) => {
            const div = document.createElement('div');
            div.className = 'related-item';
            div.style.animationDelay = `${idx * 0.03}s`;

            const hue = Math.abs(this.hashCode(t.title || '')) % 360;
            const imgHtml = t.artworkUrl
                ? `<img src="${t.artworkUrl.replace('1000x1000', '250x250')}" alt="" loading="lazy">`
                : `<div class="img-fallback" style="background:linear-gradient(135deg, hsl(${hue},40%,20%), hsl(${(hue + 40) % 360},40%,15%));">🎵</div>`;

            div.innerHTML = `
                <div class="related-content-wrapper">
                    <div class="related-img">${imgHtml}</div>
                    <div class="related-info">
                        <div class="related-title">${t.title || 'Unknown'}</div>
                        <div class="related-artist">${t.artist || ''}</div>
                    </div>
                    <i class="fas fa-play-circle related-play"></i>
                </div>
            `;
            div.onclick = () => this.loadSong(t._idx);
            list.appendChild(div);

            // Fetch artwork instantly via Deezer (no more setTimeout!)
            if (!t.artworkUrl && t.artist && t.title) {
                const imgEl = div.querySelector('.related-img');
                this.fetchArtworkForElement(imgEl, t);
            }
        });
    }

    async fetchArtworkForElement(imgContainer, track) {
        const deezerData = await this.fetchDeezerMeta(track.artist, track.title);
        
        if (deezerData && imgContainer) {
            // Deezer gives us a perfect 250x250 image for sidebars
            imgContainer.innerHTML = `<img src="${deezerData.album.cover_medium}" alt="" loading="lazy">`;
            
            // Store the high-res version and preview URL for when they click it
            track.artworkUrl = deezerData.album.cover_xl; 
            if (deezerData.preview) track.previewUrl = deezerData.preview;
        }
    }

    shufflePlaylist() {
        if (this.playlist.length <= 1) return;
        // Keep current song, shuffle the rest
        const current = this.playlist[this.currentIndex];
        const rest = this.playlist.filter((_, i) => i !== this.currentIndex);
        this.shuffleArray(rest);
        this.playlist = [current, ...rest];
        this.currentIndex = 0;
        this.updateRightPanel();
        this.showStatus('🔀 Playlist shuffled!', 'success');
    }

    async loadRelatedTracks(artist, title) {
        const list = document.getElementById('relatedList');
        if (!list) return;

        list.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const skel = document.createElement('div');
            skel.className = 'related-skeleton';
            skel.innerHTML = `<div class="skeleton-img"></div><div class="skeleton-text"><div class="skeleton-line"></div><div class="skeleton-line"></div></div>`;
            list.appendChild(skel);
        }

        try {
            const url = `https://ws.audioscrobbler.com/2.0/?method=track.getsimilar&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}&api_key=${this.API_KEY}&format=json&limit=10&autocorrect=1`;
            const res = await fetch(url);
            const data = await res.json();
            let tracks = data.similartracks?.track || [];

            if (tracks.length === 0 && this.playlist.length > 1) {
                tracks = this.playlist
                    .filter((_, i) => i !== this.currentIndex)
                    .slice(0, 6)
                    .map(t => ({ name: t.title, artist: { name: t.artist } }));
            }

            if (tracks.length === 0) {
                list.innerHTML = '<div class="placeholder-text"><i class="fas fa-music" style="font-size:20px;opacity:0.3;"></i> No related tracks found</div>';
                return;
            }

            const displayTracks = tracks.slice(0, 8);
            list.innerHTML = ''; // Clear the skeletons

            displayTracks.forEach((t, idx) => {
                if (!t.name) return;
                const artistName = typeof t.artist === 'string' ? t.artist : t.artist.name;
                const div = document.createElement('div');
                div.className = 'related-item';
                div.style.animationDelay = `${idx * 0.05}s`;

                const hue = Math.abs(this.hashCode(t.name)) % 360;
                let matchScore = Math.floor(Math.random() * 15) + 80;
                if (t.match) {
                    matchScore = this.boostMatchScore(parseFloat(t.match));
                }

                const imgHtml = `<div class="img-fallback" style="background:linear-gradient(135deg, hsl(${hue},40%,20%), hsl(${(hue + 40) % 360},40%,15%));">🎵</div>`;

                div.innerHTML = `
                <div class="related-content-wrapper">
                    <div class="related-img" id="related-img-${idx}">${imgHtml}</div>
                    <div class="related-info">
                        <div class="related-title">${t.name}</div>
                        <div class="related-artist">${artistName}</div>
                    </div>
                    <i class="fas fa-play-circle related-play"></i>
                </div>
                <div class="related-match-score">${matchScore}% MATCH</div>
            `;
                
                list.appendChild(div);

                const trackObj = { title: t.name, artist: artistName, artworkUrl: null };

                div.onclick = () => {
                    this.loadSimilarAsSong(t.name, artistName, trackObj.artworkUrl, matchScore);
                };

                // Fetch artwork instantly!
                const imgContainer = div.querySelector(`#related-img-${idx}`);
                this.fetchArtworkForElement(imgContainer, trackObj);
            });
        } catch (e) {
            console.warn("Related tracks error", e);
            list.innerHTML = '<div class="placeholder-text">Could not load related tracks.</div>';
        }
    }

    // ─── LOAD SIMILAR SONG AS MAIN ────────
    async loadSimilarAsSong(songName, artistName, artUrl = null, matchScore = null) {
        this.stopAudio();

        // Build a new track object for the clicked song
        const newTrack = {
            title: songName,
            artist: artistName,
            match: matchScore || (Math.floor(Math.random() * 10) + 88),
            previewUrl: null, // loadSong will fetch the real one
            artworkUrl: artUrl,
            genre: null
        };

        // Put this track at the front of the playlist and load it
        this.playlist.unshift(newTrack);
        this.currentIndex = 0;
        this.currentPlaylistId = null; // Stay in discovery mode

        // Load the song into the main player (fetches artwork, preview, genre)
        await this.loadSong(0);
    }

    // ─── LIBRARY & PLAYLISTS ───────────────

    renderLibrary() {
        this.playlistManager.load();
        const list = document.getElementById('playlistList');
        if (!list) return;
        list.innerHTML = '';

        const playlists = this.playlistManager.getPlaylists();
        if (playlists.length === 0) {
            list.innerHTML = '<div class="empty-playlist-state"><i class="fas fa-music"></i><span>No playlists yet</span><span class="empty-hint">Tap + to create one</span></div>';
        } else {
            playlists.forEach(pl => {
                const el = document.createElement('div');
                el.className = 'playlist-card';

                // Build 2×2 thumbnail grid from track artworks
                const artworks = pl.tracks
                    .map(t => t.artworkUrl)
                    .filter(Boolean);
                const uniqueArts = [...new Set(artworks)].slice(0, 4);

                let thumbHtml = '';
                if (uniqueArts.length === 0) {
                    // Gradient fallback with playlist initial
                    const hue = Math.abs(this.hashCode(pl.name)) % 360;
                    thumbHtml = `<div class="playlist-thumb-fallback" style="background:linear-gradient(135deg, hsl(${hue},50%,35%), hsl(${(hue + 60) % 360},50%,25%));">${pl.name.charAt(0)}</div>`;
                } else if (uniqueArts.length === 1) {
                    thumbHtml = `<div class="playlist-thumb-grid single-art"><img src="${uniqueArts[0].replace('600x600bb', '100x100bb')}" alt=""><div class="playlist-play-overlay"><i class="fas fa-play"></i></div></div>`;
                } else {
                    // Fill up to 4 slots (repeat if needed)
                    const slots = [];
                    for (let i = 0; i < 4; i++) {
                        slots.push(uniqueArts[i % uniqueArts.length]);
                    }
                    thumbHtml = `<div class="playlist-thumb-grid">${slots.map(u => `<img src="${u.replace('600x600bb', '100x100bb')}" alt="">`).join('')}<div class="playlist-play-overlay"><i class="fas fa-play"></i></div></div>`;
                }

                // Extract top genre from tracks
                const genres = pl.tracks.map(t => t.genre).filter(Boolean);
                const topGenre = genres.length > 0 ? this.getMostFrequent(genres) : '';
                const metaParts = [`${pl.tracks.length} song${pl.tracks.length !== 1 ? 's' : ''}`];
                if (topGenre) metaParts.push(topGenre);

                el.innerHTML = `
                    ${thumbHtml}
                    <div class="playlist-card-info">
                        <div class="playlist-card-name">${pl.name}</div>
                        <div class="playlist-card-meta">${metaParts.join(' · ')}</div>
                    </div>
                    <button class="playlist-delete-btn" title="Delete playlist"><i class="fas fa-trash-alt"></i></button>
                `;
                el.onclick = () => this.loadPlaylist(pl.id);
                el.querySelector('.playlist-delete-btn').onclick = (e) => {
                    e.stopPropagation();
                    if (confirm(`Delete "${pl.name}"?`)) {
                        this.playlistManager.deletePlaylist(pl.id);
                        this.renderLibrary();
                        this.showStatus(`🗑 "${pl.name}" deleted`, 'success');
                    }
                };
                list.appendChild(el);
            });
        }
    }

    loadPlaylist(id) {
        const result = this.playlistManager.getPlaylist(id);
        if (!result || !result.tracks || result.tracks.length === 0) {
            this.showStatus(`❌ ${result ? result.name : 'Playlist'} is empty. ${id === 'dailymix' ? 'Search for some songs first!' : ''}`, 'error');
            return;
        }

        // Ensure all tracks have a match score
        this.playlist = result.tracks.map(t => ({
            ...t,
            match: t.match != null ? t.match : 85
        }));
        this.currentIndex = 0;
        this.currentPlaylistId = id;

        const searchSection = document.getElementById('searchSection');
        const appLayout = document.getElementById('appLayout');
        searchSection.style.transform = 'translateY(-100vh)';
        searchSection.style.opacity = '0';
        searchSection.style.pointerEvents = 'none';
        appLayout.classList.add('active');
        appLayout.removeAttribute('inert');
        document.getElementById('resetBtn').style.display = 'flex';

        this.showStatus(`📂 Playing "${result.name}"`, 'success');
        this.loadSong(0);
    }

    createPlaylistPrompt() {
        const name = prompt("Enter playlist name:");
        if (name && name.trim()) {
            this.playlistManager.createPlaylist(name.trim());
            this.renderLibrary();
        }
    }

    // ─── INLINE PLAYLIST PICKER ────────────

    showPlaylistPicker() {
        const track = this.playlist[this.currentIndex];
        if (!track) return;

        const picker = document.getElementById('playlistPicker');
        const pickerList = document.getElementById('pickerList');
        pickerList.innerHTML = '';

        const playlists = this.playlistManager.getPlaylists();

        if (playlists.length === 0) {
            pickerList.innerHTML = '<div class="empty-playlist-state compact"><i class="fas fa-music"></i><span>No playlists yet</span></div>';
        } else {
            playlists.forEach(p => {
                const item = document.createElement('div');
                item.className = 'picker-item';
                const alreadyIn = p.tracks.some(t => t.title === track.title && t.artist === track.artist);
                item.innerHTML = `
                    <span>${p.name}</span>
                    ${alreadyIn ? '<i class="fas fa-check" style="color: var(--primary); font-size:12px;"></i>' : ''}
                `;
                if (!alreadyIn) {
                    item.onclick = (e) => {
                        e.stopPropagation();
                        this.playlistManager.addToPlaylist(p.id, track);
                        this.showStatus(`✅ Added to "${p.name}"`, 'success');
                        this.hidePlaylistPicker();
                        this.renderLibrary();
                    };
                } else {
                    item.style.opacity = '0.4';
                    item.style.cursor = 'default';
                }
                pickerList.appendChild(item);
            });
        }

        picker.style.display = 'flex';
    }

    hidePlaylistPicker() {
        document.getElementById('playlistPicker').style.display = 'none';
    }

    createAndAddToPlaylist() {
        const name = prompt("New playlist name:");
        if (name && name.trim()) {
            const pl = this.playlistManager.createPlaylist(name.trim());
            const track = this.playlist[this.currentIndex];
            if (track) {
                this.playlistManager.addToPlaylist(pl.id, track);
                this.showStatus(`✅ Created "${pl.name}" and added track`, 'success');
            }
            this.hidePlaylistPicker();
            this.renderLibrary();
        }
    }

    // ─── LIKES ─────────────────────────────

    toggleLike() {
        const track = this.playlist[this.currentIndex];
        if (!track) return;
        const isLiked = this.playlistManager.toggleLike(track);
        this.updateLikeButton();
        this.showStatus(isLiked ? '❤️ Added to Liked Songs' : '💔 Removed from Liked Songs', 'success');
        // Likes feed into Daily Mix
        this.playlistManager.enrichDailyMix(track);
        this.renderLibrary();
    }

    updateLikeButton() {
        const track = this.playlist[this.currentIndex];
        const btn = document.getElementById('likeBtn');
        if (!btn || !track) return;
        const isLiked = this.playlistManager.isLiked(track);
        if (isLiked) {
            btn.innerHTML = '<i class="fas fa-heart"></i>';
            btn.classList.add('active');
        } else {
            btn.innerHTML = '<i class="far fa-heart"></i>';
            btn.classList.remove('active');
        }
    }

    // ─── HELPERS ───────────────────────────

    /**
     * Picks the best iTunes result by comparing artist + title similarity.
     * Returns the result most likely to match the given artist & title, or null if no good match.
     */
    /**
     * Picks the best iTunes result by comparing artist + title similarity.
     * Returns the result most likely to match the given artist & title, or null if no good match.
     */
    /**
     * Picks the best iTunes result by comparing artist + title similarity.
     * Returns the result most likely to match the given artist & title, or null if no good match.
     */
    fetchDeezerMeta(artist, title) {
        return new Promise((resolve) => {
            // Clean up the text so Deezer doesn't get confused by features or remixes
            const cleanArtist = (artist || '').split(' feat')[0].split(' ft')[0].trim();
            const cleanTitle = (title || '').split(' (feat')[0].split(' [')[0].trim();
            
            const script = document.createElement('script');
            // Create a unique callback function name for this specific request
            const callbackName = 'deezer_cb_' + Math.round(1000000 * Math.random());
            
            // Define what happens when Deezer replies
            window[callbackName] = function(data) {
                delete window[callbackName];
                document.body.removeChild(script);
                
                if (data && data.data && data.data.length > 0) {
                    resolve(data.data[0]); // Return the best track match
                } else {
                    resolve(null); // No match found
                }
            };

            // Inject the script tag to trigger the request
            const query = encodeURIComponent(`artist:"${cleanArtist}" track:"${cleanTitle}"`);
            script.src = `https://api.deezer.com/search?q=${query}&limit=1&output=jsonp&callback=${callbackName}`;
            script.onerror = () => resolve(null);
            document.body.appendChild(script);
        });
    }

    getVibeText(score) {
        if (score > 90) return '🔥 CERTIFIED BANGER';
        if (score > 80) return '✨ SOULMATE SONG';
        if (score > 70) return '🌊 SAME WAVE';
        return '🤔 INTERESTING PICK';
    }

    stringToColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, 55%, 60%)`;
    }

    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
        return hash;
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    getMostFrequent(arr) {
        const counts = {};
        arr.forEach(v => counts[v] = (counts[v] || 0) + 1);
        return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    }

    showStatus(msg, type) {
        const status = document.getElementById('status');
        if (!status) return;
        status.innerHTML = msg;
        status.className = 'status-msg ' + (type || '');
    }
}

// Global Init
const app = new SoundMatchApp();
window.app = app;