class PlaylistManager {
    constructor() {
        this.storageKey = 'soundmatch_library';
        this.data = {
            playlists: [],
            history: [],
            liked: [],
            searches: [], // Tracks every search the user performs (artist + song)
            lastDailyMix: null // { date: 'YYYY-MM-DD', tracks: [] }
        };

        // Migrate old favorites if exist
        try {
            const oldFavs = JSON.parse(localStorage.getItem('soundmatch_favs'));
            if (oldFavs && oldFavs.length > 0) {
                this.data.liked = oldFavs;
                localStorage.removeItem('soundmatch_favs');
            }
        } catch (e) { }

        this.load();
    }

    load() {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                this.data = { ...this.data, ...parsed };
                if (!Array.isArray(this.data.playlists)) this.data.playlists = [];
                if (!Array.isArray(this.data.history)) this.data.history = [];
                if (!Array.isArray(this.data.liked)) this.data.liked = [];
                if (!Array.isArray(this.data.searches)) this.data.searches = [];
            } catch (e) {
                console.error("Failed to load library", e);
            }
        }
    }

    save() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.data));
    }

    // --- Search Tracking (for Daily Mix) ---

    addSearch(artist, song) {
        this.data.searches.unshift({ artist, song, timestamp: Date.now() });
        // Keep last 100 searches
        if (this.data.searches.length > 100) this.data.searches.length = 100;
        // Invalidate daily mix so it rebuilds with new data
        this.data.lastDailyMix = null;
        this.save();
    }

    // --- History ---

    addToHistory(track) {
        if (this.data.history.length > 0 &&
            this.data.history[0].title === track.title &&
            this.data.history[0].artist === track.artist) {
            return;
        }
        this.data.history.unshift({ ...track, timestamp: Date.now() });
        if (this.data.history.length > 50) this.data.history.pop();
        this.save();
    }

    getHistory() { return this.data.history; }

    // --- Likes ---

    toggleLike(track) {
        const idx = this.data.liked.findIndex(t => t.title === track.title && t.artist === track.artist);
        if (idx === -1) {
            this.data.liked.unshift({ ...track, timestamp: Date.now() });
            this.save();
            return true;
        } else {
            this.data.liked.splice(idx, 1);
            this.save();
            return false;
        }
    }

    isLiked(track) {
        if (!track) return false;
        return this.data.liked.some(t => t.title === track.title && t.artist === track.artist);
    }

    getLiked() { return this.data.liked; }

    // --- Playlists ---

    createPlaylist(name) {
        const playlist = { id: 'pl_' + Date.now(), name, tracks: [], createdAt: Date.now() };
        this.data.playlists.push(playlist);
        this.save();
        return playlist;
    }

    deletePlaylist(id) {
        this.data.playlists = this.data.playlists.filter(p => p.id !== id);
        this.save();
    }

    addToPlaylist(playlistId, track) {
        const playlist = this.data.playlists.find(p => p.id === playlistId);
        if (playlist) {
            // Avoid exact duplicates
            const exists = playlist.tracks.some(t => t.title === track.title && t.artist === track.artist);
            if (exists) return false;
            playlist.tracks.push({ ...track, addedAt: Date.now() });
            // Playlist adds feed into Daily Mix
            this.enrichDailyMix(track);
            this.save();
            return true;
        }
        return false;
    }

    removeFromPlaylist(playlistId, trackIndex) {
        const playlist = this.data.playlists.find(p => p.id === playlistId);
        if (playlist && playlist.tracks[trackIndex]) {
            playlist.tracks.splice(trackIndex, 1);
            this.save();
            return true;
        }
        return false;
    }

    getPlaylists() { return this.data.playlists; }

    getPlaylist(id) {
        if (id === 'liked') return { name: 'Liked Songs', tracks: this.data.liked, id: 'liked' };
        if (id === 'history') return { name: 'History', tracks: this.data.history, id: 'history' };
        if (id === 'dailymix') return this.getDailyMix();
        return this.data.playlists.find(p => p.id === id);
    }

    // --- Daily Mix (grows from activity) ---

    /**
     * Called when user likes a song or adds to playlist.
     * Invalidates cached daily mix so it rebuilds with new data.
     */
    enrichDailyMix(track) {
        // Invalidate so next getDailyMix() rebuilds with fresh data
        this.data.lastDailyMix = null;
        this.save();
    }

    getDailyMix() {
        const today = new Date().toISOString().split('T')[0];

        if (this.data.lastDailyMix && this.data.lastDailyMix.date === today && this.data.lastDailyMix.tracks.length > 0) {
            return {
                id: 'dailymix',
                name: 'Daily Mix',
                tracks: this.data.lastDailyMix.tracks,
                description: 'Based on your activity.'
            };
        }

        // Build from ALL user activity: history + liked + playlist tracks
        const mix = [];
        const seen = new Set();

        const addTrack = (t) => {
            const key = (t.title + '|' + t.artist).toLowerCase();
            if (!seen.has(key) && t.title && t.artist) {
                seen.add(key);
                mix.push({ ...t, match: t.match || 85 });
            }
        };

        // 1. Liked songs (highest priority — user explicitly liked these)
        for (const t of this.data.liked) {
            addTrack(t);
        }

        // 2. Songs from user-created playlists
        for (const pl of this.data.playlists) {
            for (const t of pl.tracks) {
                addTrack(t);
            }
        }

        // 3. Play history (songs discovered through searches)
        for (const t of this.data.history) {
            addTrack(t);
            if (mix.length >= 30) break;
        }

        // Shuffle for variety
        for (let i = mix.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [mix[i], mix[j]] = [mix[j], mix[i]];
        }

        this.data.lastDailyMix = { date: today, tracks: mix };
        this.save();

        return {
            id: 'dailymix',
            name: 'Daily Mix',
            tracks: mix,
            description: mix.length === 0 ? 'Search for some songs to build your mix!' : `${mix.length} tracks based on your activity.`
        };
    }
}
