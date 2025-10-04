// --- Heavily refactored for clarity, functionality, and deployment readiness.
document.addEventListener('DOMContentLoaded', () => {
    // ======== GLOBAL STATE & CONSTANTS ========
    const API_BASE_URL = ' https://sub4sub-vpup.onrender.com';
    const VIDEO_WATCH_TIME = 20; // seconds

    const appState = {
        currentUser: null,
        sessionToken: null,
        coins: 0,
        myVideos: [],
        discoverLinks: [],
        sponsoredLinks: [],
        subscribers: [],
        mustSubscribeBack: false,
        isNewUser: false,
        notifications: [], // Add notifications array to state
        activeCardElement: null,
        subscribedToIds: [],
        isNewUser: false, // Will be set to true on first login
    };

    let videoWatchInterval;
    let mandatoryWatchInterval;
    let youtubePlayer;
    let mandatoryPlayer;
    
    // This variable will hold our live connection to the server
    let eventSource = null;

    // ======== DOM SELECTORS ========
    const DOM = {
        appContainer: document.querySelector('.container'),
        pageTitle: document.getElementById('page-title'),
        pages: document.querySelectorAll('.page'),
        navLinks: document.querySelectorAll('.nav-link'),
        logoutNav: document.getElementById('logout-nav'),
        authModal: document.getElementById('login-modal'),
        loginView: document.getElementById('login-view'),
        registerView: document.getElementById('register-view'),
        showRegisterLink: document.getElementById('show-register-link'),
        showLoginLink: document.getElementById('show-login-link'),
        loginForm: document.getElementById('login-form'),
        registerForm: document.getElementById('register-form'),
        loginEmailInput: document.getElementById('login-email'),
        loginPasswordInput: document.getElementById('login-password'),
        registerEmailInput: document.getElementById('register-email'),
        registerChannelNameInput: document.getElementById('register-channel-name'),
        registerPasswordInput: document.getElementById('register-password'),
        registerReferralInput: document.getElementById('register-referral-code'),
        toast: document.getElementById('toast'),
        userChannelName: document.getElementById('user-channel-name'),
        userCoins: document.getElementById('user-coins'),
        sponsoredGrid: document.getElementById('sponsored-links-grid'),
        discoverGrid: document.getElementById('discover-links-grid'),
        myVideosList: document.getElementById('my-videos-list'),
        addVideoForm: document.getElementById('add-video-form'),
        videoUrlInput: document.getElementById('video-url-input'),
        subscribersList: document.getElementById('subscribe-back-list'),
        videoWatchModal: document.getElementById('video-watch-modal'),
        videoModalTitle: document.getElementById('video-modal-title'),
        youtubePlayerContainer: document.getElementById('youtube-player'),
        watchTimer: document.getElementById('watch-timer'),
        watchProgressBar: document.getElementById('watch-progress-bar'),
        subscribeOnYoutubeBtn: document.getElementById('subscribe-on-youtube-btn'),
        confirmPaymentBtn: document.getElementById('confirm-payment-btn'),
        boostModal: document.getElementById('boost-modal'),
        confirmBoostBtn: document.getElementById('confirm-boost-btn'),
        refuseSubModal: document.getElementById('refuse-sub-modal'),
        refuseChannelName: document.getElementById('refuse-channel-name'),
        submitRefuseReasonBtn: document.getElementById('submit-refuse-reason-btn'),
        mandatorySubModal: document.getElementById('mandatory-sub-modal'),
        mandatoryYoutubePlayerContainer: document.getElementById('mandatory-youtube-player'),
        mandatoryWatchTimer: document.getElementById('mandatory-watch-timer'),
        mandatoryWatchProgressBar: document.getElementById('mandatory-watch-progress-bar'),
        mandatorySubscribeBtn: document.getElementById('mandatory-subscribe-btn'),
        mandatoryConfirmBtn: document.getElementById('mandatory-confirm-btn'),
        userReferralCode: document.getElementById('user-referral-code'),
        copyReferralBtn: document.getElementById('copy-referral-btn'),
        searchForm: document.getElementById('search-form'),
        searchInput: document.getElementById('search-input'),
        searchResultsPage: document.getElementById('search-results-page'),
        searchResultsGrid: document.getElementById('search-results-grid'),
        userVideosPage: document.getElementById('user-videos-page'),
        userVideosGrid: document.getElementById('user-videos-grid'),
        giftForm: document.getElementById('gift-form'),
        giftAmountInput: document.getElementById('gift-amount-input'),
        sidebar: document.querySelector('.sidebar'), // Select the sidebar itself
        mobileMenuToggle: document.getElementById('mobile-menu-toggle'),
    };

    const api = {
        async _fetch(url, options = {}) {
            const headers = {
                'Content-Type': 'application/json',
                ...options.headers,
            };
            if (appState.sessionToken) {
                headers['Authorization'] = `Bearer ${appState.sessionToken}`;
            }

            try {
                const response = await fetch(`${API_BASE_URL}${url}`, { ...options, headers });
                const contentType = response.headers.get("content-type");

                if (!contentType || !contentType.includes("application/json")) {
                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(errorText || `Server Error: ${response.statusText} (Status: ${response.status})`);
                    }
                    return null;
                }

                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.message || `An unknown error occurred.`);
                }
                return data;

            } catch (error) {
                throw error;
            }
        },

        // Auth
        login: (email, password) => api._fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
        register: (email, channelName, password, referralCode) => api._fetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, channelName, password, referralCode }) }),
        checkToken: (token) => api._fetch('/api/auth/check-token', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } }),

        // Videos
        fetchSponsoredLinks: () => api._fetch('/api/videos/sponsored'),
        fetchDiscoverLinks: () => api._fetch('/api/videos/discover'),
        fetchMyVideos: () => api._fetch('/api/videos/my-videos'),
        addVideo: (videoUrl) => api._fetch('/api/videos/my-videos', { method: 'POST', body: JSON.stringify({ videoUrl }) }),
        deleteVideo: (videoId) => api._fetch(`/api/videos/my-videos/${videoId}`, { method: 'DELETE' }),
        boostVideo: (videoId, boostAmount) => api._fetch(`/api/videos/my-videos/${videoId}/boost`, { method: 'POST', body: JSON.stringify({ boostAmount }) }),
        getMandatoryVideo: () => api._fetch('/api/videos/mandatory'),
        fetchNextBoostedVideo: () => api._fetch('/api/videos/next-boosted'),
        fetchNotifications: () => api._fetch('/api/users/notifications'),
        markNotificationAsRead: (id) => api._fetch(`/api/users/notifications/${id}/read`, { method: 'POST' }),
        searchUsers: (query) => api._fetch(`/api/users/search?q=${encodeURIComponent(query)}`),
        fetchVideosByUser: (userId) => api._fetch(`/api/users/${userId}/videos`),

        // Subscriptions
        fetchSubscribers: () => api._fetch('/api/subscriptions/my-subscribers'),
        performSubscription: (targetChannelId, isSponsored, linkId) => api._fetch('/api/subscriptions/perform', { method: 'POST', body: JSON.stringify({ targetChannelId, isSponsored, linkId }) }),
        confirmMandatory: () => api._fetch('/api/subscriptions/confirm-mandatory', { method: 'POST' }),
        subscribeBack: (subscriptionId) => api._fetch(`/api/subscriptions/subscribe-back/${subscriptionId}`, { method: 'POST' }),
        refuseSubscription: (subscriptionId, reason) => api._fetch(`/api/subscriptions/refuse/${subscriptionId}`, { method: 'POST', body: JSON.stringify({ reason }) }),
        fetchMySubscriptionIds: () => api._fetch('/api/subscriptions/my-subscription-ids'),
        
        // Payments
        requestPayment: (amountETB, depositorPhoneNumber) => api._fetch('/api/payments/request', {
            method: 'POST',
            body: JSON.stringify({ amountETB, depositorPhoneNumber })
        }),

        // Gift
        sendGift: (amount) => api._fetch('/api/users/gift', { 
            method: 'POST', 
            body: JSON.stringify({ amount }) 
        }),
    };
    

    // ======== HELPER & UI FUNCTIONS ========
    const showPage = (pageId) => {
        DOM.pages.forEach(p => p.classList.remove('active-page'));
        document.getElementById(pageId)?.classList.add('active-page');
        DOM.navLinks.forEach(link => link.classList.toggle('active', link.dataset.page === pageId));
        DOM.pageTitle.textContent = document.querySelector(`.nav-link[data-page="${pageId}"]`)?.textContent || 'Dashboard';
    };

    const showToast = (message, type = 'success') => {
        DOM.toast.textContent = message;
        DOM.toast.className = `toast show ${type}`;
        setTimeout(() => DOM.toast.className = 'toast', 4000); // Increased duration for better readability
    };

    const showModal = (modalElement) => modalElement.classList.add('active');
    const hideModal = (modalElement) => modalElement.classList.remove('active');

    const updateUI = () => {
        if (appState.currentUser) {
            DOM.userChannelName.textContent = appState.currentUser.channelName;
            DOM.userCoins.textContent = appState.coins;
            DOM.appContainer.style.display = 'flex';
            hideModal(DOM.authModal);
            document.body.classList.remove('logged-out');
            document.body.classList.add('logged-in');
        } else {
            DOM.appContainer.style.display = 'none';
            showModal(DOM.authModal);
            document.body.classList.add('logged-out');
            document.body.classList.remove('logged-in');
        }
    };

    const handleSuccessfulAuth = (data) => {
        appState.currentUser = data.user;
        appState.sessionToken = data.token;
        appState.coins = data.user.coins;
        appState.isNewUser = data.user.isNewUser;
        localStorage.setItem('sessionToken', data.token);
        updateUI();
        initializeApp();
    };

    const handleLogout = () => {
        if (eventSource) {
            eventSource.close();
            eventSource = null;
            console.log('[SSE] Connection closed.');
        }
        Object.keys(appState).forEach(key => appState[key] = Array.isArray(appState[key]) ? [] : null);
        appState.coins = 0;
        localStorage.removeItem('sessionToken');
        updateUI();
        showView('login');
        DOM.sponsoredGrid.innerHTML = '';
        DOM.discoverGrid.innerHTML = '';
        DOM.myVideosList.innerHTML = '';
        DOM.subscribersList.innerHTML = '';
        showToast('You have been logged out.', 'success');
    };

    const showView = (view) => {
        DOM.loginView.classList.toggle('hidden', view !== 'login');
        DOM.registerView.classList.toggle('hidden', view !== 'register');
    };

    // ======== RENDER FUNCTIONS ========
    const renderReferralInfo = () => {
        if (appState.currentUser && appState.currentUser.referralCode) {
            DOM.userReferralCode.textContent = appState.currentUser.referralCode;
        } else {
            DOM.userReferralCode.textContent = 'N/A';
        }
    };

    const createVideoCard = (link) => {
        const card = document.createElement('div');
        card.className = 'video-card';
        if (link.isBoosted) {
            card.classList.add('boosted-card');
        }

        // --- CHANGE --- Added the span for the close button to the HTML structure.
        card.innerHTML = `
            <span class="close-card-btn">&times;</span>
            <div class="thumbnail-container"><img src="https://img.youtube.com/vi/${link.youtubeId}/mqdefault.jpg" alt="Video Thumbnail"></div>
            <div class="card-content">
                <h4 class="channel-name">${link.channelName || 'Unknown Channel'}</h4>
                <p class="video-title">${link.videoTitle}</p>
            </div>`;
        
        const timerId = manageBoostedCard(card);
        card.dataset.removalTimer = timerId;

        // --- CHANGE --- Added event listener for the new close button.
        const closeBtn = card.querySelector('.close-card-btn');
        closeBtn.addEventListener('click', (e) => {
            // Prevent the card's main click event from firing when the 'X' is clicked.
            e.stopPropagation(); 
            
            // Re-use the existing function to fade out the card and fetch a new one if it was boosted.
            removeCardAndPotentiallyReplace(card);
        });

        card.addEventListener('click', () => {
            const timerToCancel = card.dataset.removalTimer;
            if (timerToCancel) {
                clearTimeout(parseInt(timerToCancel, 10));
            }
            
            if (appState.mustSubscribeBack) {
                showToast("You must subscribe back to pending channels first.", "error");
                showPage('subscribers-page');
                return;
            }
            handleVideoClick(link, card);
        });
        return card;
    };

    const renderDiscoverPage = () => {
        // --- CHANGE --- This now correctly renders the sponsored links.
        DOM.sponsoredGrid.innerHTML = '';
        appState.sponsoredLinks.forEach(link => {
            const card = createVideoCard(link);
            DOM.sponsoredGrid.appendChild(card);
        });
        
        DOM.discoverGrid.innerHTML = '';
        appState.discoverLinks.forEach(link => {
            const card = createVideoCard(link);
            DOM.discoverGrid.appendChild(card);
        });
    };
    
    const renderMyVideosPage = () => {
        DOM.myVideosList.innerHTML = '';
        if (!appState.myVideos.length) {
            DOM.myVideosList.innerHTML = `<p style="text-align: center; margin-top: 20px;">You haven't added any videos yet. Add one above!</p>`;
        }
        appState.myVideos.forEach(video => {
            const item = document.createElement('div');
            item.className = 'video-item';
            
            item.innerHTML = `
                <div class="video-info">
                    <h4>${video.videoTitle}</h4>
                    <p>
                        <i class="fas fa-eye"></i> Views: ${video.views || 0}
                    </p>
                </div>
                <div class="actions">
                    <button class="btn-primary boost-btn" data-video-id="${video._id}"><i class="fas fa-rocket"></i> Boost</button>
                    <button class="btn-secondary delete-btn" data-video-id="${video._id}"><i class="fas fa-trash"></i></button>
                </div>`;
            
            item.querySelector('.delete-btn').addEventListener('click', async () => {
                try {
                    await api.deleteVideo(video._id);
                    appState.myVideos = appState.myVideos.filter(v => v._id !== video._id);
                    renderMyVideosPage();
                    showToast("Video removed.", "success");
                } catch (error) {
                    showToast(error.message, 'error');
                }
            });
            item.querySelector('.boost-btn').addEventListener('click', () => {
                DOM.confirmBoostBtn.dataset.videoId = video._id;
                showModal(DOM.boostModal);
            });
    
            DOM.myVideosList.appendChild(item);
        });
    };

    const renderSubscriptionUpdates = () => {
        const list = document.getElementById('subscription-updates-list');
        list.innerHTML = '';
        if (!appState.notifications.length) {
            list.innerHTML = `<p style="text-align: center;">No new updates.</p>`;
        }
        appState.notifications.forEach(notif => {
            const item = document.createElement('div');
            item.className = 'update-item';
            item.innerHTML = `
                <p>${notif.message}</p>
                <button class="btn-secondary dismiss-btn"><i class="fas fa-check"></i> Dismiss</button>
            `;
            item.querySelector('.dismiss-btn').addEventListener('click', async (e) => {
                e.target.disabled = true;
                try {
                    await api.markNotificationAsRead(notif._id);
                    item.classList.add('fading-out');
                    setTimeout(() => item.remove(), 500);
                } catch (error) {
                    showToast('Could not dismiss notification.', 'error');
                    e.target.disabled = false;
                }
            });
            list.appendChild(item);
        });
    };

    const renderSubscribersPage = () => {
        DOM.subscribersList.innerHTML = '';
        appState.mustSubscribeBack = appState.subscribers.length > 0;
        if (!appState.subscribers.length) {
            DOM.subscribersList.innerHTML = `<p style="text-align: center; margin-top: 20px;">No pending subscriptions. All clear!</p>`;
        }
        appState.subscribers.forEach(sub => {
            const item = document.createElement('div');
            item.className = 'sub-item';
            item.innerHTML = `
                <div class="sub-info">
                    <h4>${sub.subscriber.channelName} subscribed to you!</h4>
                </div>
                <div class="actions">
                    <button class="btn-primary sub-back-btn" data-sub-id="${sub._id}">Subscribe Back</button>
                    <button class="btn-secondary refuse-btn" data-sub-id="${sub._id}" data-channel-name="${sub.subscriber.channelName}">Refuse</button>
                </div>`;
            item.querySelector('.sub-back-btn').addEventListener('click', () => {
                if (!sub.subscriberVideo) {
                    showToast(`${sub.subscriber.channelName} hasn't added a video yet.`, 'error');
                    return;
                }
                handleSubscribeBackVideo(sub);
            });
            item.querySelector('.refuse-btn').addEventListener('click', (e) => {
                DOM.refuseChannelName.textContent = e.target.dataset.channelName;
                DOM.submitRefuseReasonBtn.dataset.subId = e.target.dataset.subId;
                showModal(DOM.refuseSubModal);
            });
            DOM.subscribersList.appendChild(item);
        });
    };

    const renderSearchResults = (users, query) => {
        showPage('search-results-page');
        DOM.pageTitle.textContent = `Search Results for "${query}"`;
        DOM.searchResultsGrid.innerHTML = '';

        if (!users || users.length === 0) {
            DOM.searchResultsGrid.innerHTML = `<p style="text-align: center; grid-column: 1 / -1;">No users found.</p>`;
            return;
        }

        users.forEach(user => {
            const userCard = document.createElement('div');
            userCard.className = 'user-card';
            userCard.innerHTML = `
                <i class="fas fa-user-circle"></i>
                <h4>${user.channelName}</h4>
            `;
            userCard.addEventListener('click', () => {
                showUserVideos(user);
            });
            DOM.searchResultsGrid.appendChild(userCard);
        });
    };

    const showUserVideos = async (user) => {
        showPage('user-videos-page');
        DOM.pageTitle.textContent = `Videos by ${user.channelName}`;
        DOM.userVideosGrid.innerHTML = `<p>Loading videos...</p>`;

        try {
            const videos = await api.fetchVideosByUser(user._id);
            renderUserVideosPage(videos);
        } catch (error) {
            showToast('Could not load user videos.', 'error');
            DOM.userVideosGrid.innerHTML = `<p>Could not load videos. Please try again later.</p>`;
        }
    };

    const renderUserVideosPage = (videos) => {
        DOM.userVideosGrid.innerHTML = '';
        if (!videos || videos.length === 0) {
            DOM.userVideosGrid.innerHTML = `<p>This user has not added any videos yet.</p>`;
            return;
        }
        videos.forEach(video => {
            const videoCard = createVideoCard(video);
            DOM.userVideosGrid.appendChild(videoCard);
        });
    };

    // ======== VIDEO & SUBSCRIPTION LOGIC ========
    const manageBoostedCard = (cardElement) => {
        if (!cardElement.classList.contains('boosted-card')) return null;
        const timer = setTimeout(() => {
            removeCardAndPotentiallyReplace(cardElement);
        }, 20000);
        return timer;
    };

    const removeCardAndPotentiallyReplace = (cardToRemove) => {
        if (!cardToRemove) return;
        const wasBoosted = cardToRemove.classList.contains('boosted-card');
        cardToRemove.classList.add('fading-out');
        setTimeout(async () => {
            cardToRemove.remove();
            if (wasBoosted) {
                try {
                    const nextVideo = await api.fetchNextBoostedVideo();
                    if (nextVideo) {
                        const newCard = createVideoCard(nextVideo);
                        DOM.discoverGrid.prepend(newCard);
                    }
                } catch (error) {
                    console.error("Could not fetch next boosted video:", error);
                }
            }
        }, 500);
    };

    const handleVideoClick = (link, cardElement) => {
        // --- CHANGE --- New pre-check logic is added at the beginning of the function.
        const REWARD_COST = 1;

        // This check applies ONLY to peer-to-peer videos (not system-sponsored ones).
        // It verifies the owner object and its coin balance exist and are sufficient.
        if (!link.isSponsored && (!link.owner || link.owner.awaqiCoins < REWARD_COST)) {
            showToast(`This channel owner cannot afford the ${REWARD_COST} coin reward.`, 'error');
            return; // Stop the function before the modal opens.
        }
        
        // If the check passes, the original function continues...
        appState.activeCardElement = cardElement;
        DOM.videoModalTitle.textContent = `Watch & Subscribe to ${link.channelName}`;
        
        // isSubscribed now uses link.owner._id because owner is a populated object
        const isSubscribed = appState.subscribedToIds.includes(link.owner._id);
        let subscribeButton = DOM.subscribeOnYoutubeBtn;

        if (isSubscribed) {
            subscribeButton.textContent = 'Subscribed';
            subscribeButton.disabled = true;
        } else {
            subscribeButton.innerHTML = '<i class="fab fa-youtube"></i> Subscribe on YouTube';
            subscribeButton.disabled = true;
        }

        youtubePlayer?.destroy();
        youtubePlayer = new YT.Player('youtube-player', {
            videoId: link.youtubeId,
            playerVars: { 'autoplay': 1, 'controls': 0, 'rel': 0, 'modestbranding': 1 },
            events: { 'onReady': (event) => event.target.playVideo() }
        });
        showModal(DOM.videoWatchModal);
        
        if (!isSubscribed) {
            videoWatchInterval = startTimer(DOM.watchTimer, DOM.watchProgressBar, () => {
                DOM.subscribeOnYoutubeBtn.disabled = false;
                showToast('You can now subscribe!', 'success');
            });
        } else {
            clearInterval(videoWatchInterval);
            DOM.watchTimer.textContent = "0";
            DOM.watchProgressBar.style.width = '100%';
        }

        const newBtn = subscribeButton.cloneNode(true);
        subscribeButton.parentNode.replaceChild(newBtn, subscribeButton);
        DOM.subscribeOnYoutubeBtn = newBtn;
        subscribeButton = newBtn;

        if (!isSubscribed) {
            subscribeButton.addEventListener('click', async function () {
                this.disabled = true;
                window.open(`https://www.youtube.com/channel/${link.channelId}?sub_confirmation=1`, '_blank');
                try {
                    // Pass link._id instead of link.isBoosted since the backend handles rewards
                    const data = await api.performSubscription(link.channelId, null, link._id);
                    appState.coins = data.newCoins;
                    // Filter both discover and sponsored links to be safe
                    appState.discoverLinks = appState.discoverLinks.filter(l => l._id !== link._id);
                    appState.sponsoredLinks = appState.sponsoredLinks.filter(l => l._id !== link._id);

                    appState.subscribedToIds.push(link.owner._id);
                    updateUI();
                    closeRegularVideoModal();
                    showToast(data.message, 'success');
                } catch (error) {
                    showToast(error.message, 'error');
                    this.disabled = false;
                }
            });
        }
    };

    const handleSubscribeBackVideo = (subscription) => {
        const videoInfo = subscription.subscriberVideo;
        const channelName = subscription.subscriber.channelName;
        const subscriptionId = subscription._id;

        DOM.videoModalTitle.textContent = `Watch & Subscribe Back to ${channelName}`;
        DOM.subscribeOnYoutubeBtn.disabled = true;

        youtubePlayer?.destroy();
        youtubePlayer = new YT.Player('youtube-player', {
            videoId: videoInfo.youtubeId,
            playerVars: { 'autoplay': 1, 'controls': 0, 'rel': 0, 'modestbranding': 1 },
            events: { 'onReady': (event) => event.target.playVideo() }
        });
        showModal(DOM.videoWatchModal);
        videoWatchInterval = startTimer(DOM.watchTimer, DOM.watchProgressBar, () => {
            DOM.subscribeOnYoutubeBtn.disabled = false;
            showToast('You can now subscribe back!', 'success');
        });

        const newBtn = DOM.subscribeOnYoutubeBtn.cloneNode(true);
        DOM.subscribeOnYoutubeBtn.parentNode.replaceChild(newBtn, DOM.subscribeOnYoutubeBtn);
        DOM.subscribeOnYoutubeBtn = newBtn;
        
        newBtn.addEventListener('click', async function () {
            this.disabled = true;
            window.open(`https://www.youtube.com/channel/${videoInfo.channelId}?sub_confirmation=1`, '_blank');
            try {
                // --- CHANGE --- The success path for the new logic.
                const data = await api.subscribeBack(subscriptionId);
                
                appState.coins = data.newCoins; // Update your coins with the reward.
                appState.subscribers = appState.subscribers.filter(s => s._id !== subscriptionId);
                
                updateUI();
                renderSubscribersPage();
                closeRegularVideoModal();
                showToast(data.message, 'success');

                const myNewVideos = await api.fetchMyVideos();
                appState.myVideos = myNewVideos;
                renderMyVideosPage();

            } catch (error) {
                // --- CHANGE --- This catch block now handles the specific "not enough coins" failure.
                showToast(error.message, 'error'); // Show the informative message from the server.

                // If the error is the specific one we expect, unblock the user.
                if (error.message.includes('does not have enough coins')) {
                    // Remove the subscription from the local list, clearing the user's queue.
                    appState.subscribers = appState.subscribers.filter(s => s._id !== subscriptionId);
                    renderSubscribersPage(); // Re-render the "My Subscribers" page.
                    closeRegularVideoModal(); // Close the video modal.
                } else {
                    // For any other unexpected error (e.g., server offline), allow the user to try again.
                    this.disabled = false;
                }
            }
        });
    };

    const startTimer = (timerEl, progressEl, onComplete) => {
        let timeLeft = VIDEO_WATCH_TIME;
        timerEl.textContent = timeLeft;
        progressEl.style.width = '0%';
        const intervalId = setInterval(() => {
            timeLeft--;
            const progress = ((VIDEO_WATCH_TIME - timeLeft) / VIDEO_WATCH_TIME) * 100;
            progressEl.style.width = `${progress}%`;
            timerEl.textContent = timeLeft;
            if (timeLeft <= 0) {
                clearInterval(intervalId);
                timerEl.textContent = "0";
                progressEl.style.width = '100%';
                onComplete();
            }
        }, 1000);
        return intervalId;
    };

    const closeRegularVideoModal = () => {
        clearInterval(videoWatchInterval);
        youtubePlayer?.stopVideo();
        hideModal(DOM.videoWatchModal);

        if (appState.activeCardElement) {
            removeCardAndPotentiallyReplace(appState.activeCardElement);
        }
        appState.activeCardElement = null;
    };

    const startMandatorySubscription = async () => {
        try {
            const videoData = await api.getMandatoryVideo();
            if (!videoData) throw new Error('Could not load mandatory video.');

            DOM.mandatorySubscribeBtn.disabled = true;
            DOM.mandatoryConfirmBtn.classList.add('hidden');

            mandatoryPlayer?.destroy();
            mandatoryPlayer = new YT.Player('mandatory-youtube-player', {
                videoId: videoData.videoId,
                playerVars: { 'autoplay': 1, 'controls': 0, 'rel': 0, 'modestbranding': 1 },
                events: { 'onReady': (event) => event.target.playVideo() }
            });

            showModal(DOM.mandatorySubModal);

            mandatoryWatchInterval = startTimer(DOM.mandatoryWatchTimer, DOM.mandatoryWatchProgressBar, () => {
                DOM.mandatorySubscribeBtn.disabled = false;
                showToast('You can now subscribe to the partner channel!', 'success');
            });

            DOM.mandatorySubscribeBtn.onclick = () => {
                window.open(`https://www.youtube.com/channel/${videoData.channelId}?sub_confirmation=1`, '_blank');
                DOM.mandatoryConfirmBtn.classList.remove('hidden'); // Show the confirm button after they click subscribe
            };

            DOM.mandatoryConfirmBtn.onclick = async () => {
                try {
                    const confirmData = await api.confirmMandatory();
                    appState.coins = confirmData.newCoins;
                    appState.isNewUser = false; // Update state
                    updateUI();
                    showToast(confirmData.message, "success");
                    closeMandatoryVideoModal();
                } catch (error) {
                    showToast(error.message, 'error');
                }
            };
        } catch (error) {
            showToast(error.message, 'error');
            // If the mandatory video fails to load, we mark the user as not new
            // to prevent them from being permanently locked out.
            appState.isNewUser = false; 
        }
    };

    const closeMandatoryVideoModal = () => {
        clearInterval(mandatoryWatchInterval);
        mandatoryPlayer?.stopVideo();
        hideModal(DOM.mandatorySubModal);
    };

    // ======== EVENT LISTENERS ========
    DOM.navLinks.forEach(link => link.addEventListener('click', () => showPage(link.dataset.page)));
    DOM.sidebar.classList.remove('open');
    DOM.logoutNav.addEventListener('click', handleLogout);
    DOM.showRegisterLink.addEventListener('click', (e) => { e.preventDefault(); showView('register'); });
    DOM.showLoginLink.addEventListener('click', (e) => { e.preventDefault(); showView('login'); });

    DOM.mobileMenuToggle.addEventListener('click', () => {
        DOM.sidebar.classList.toggle('open');
    });

    DOM.logoutNav.addEventListener('click', handleLogout);

    DOM.loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const data = await api.login(DOM.loginEmailInput.value, DOM.loginPasswordInput.value);
            handleSuccessfulAuth(data);
            showToast('Login successful!', 'success');
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    DOM.registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const data = await api.register(DOM.registerEmailInput.value, DOM.registerChannelNameInput.value, DOM.registerPasswordInput.value, DOM.registerReferralInput.value);
            handleSuccessfulAuth(data);
            showToast('Registration successful! Complete one task to begin.', 'success');
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    document.querySelectorAll('.close-modal-btn').forEach(btn => btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-overlay');
        if (modal === DOM.videoWatchModal) closeRegularVideoModal();
        else if (modal) hideModal(modal);
    }));

    DOM.giftForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const amount = parseInt(DOM.giftAmountInput.value, 10);
        const giftButton = DOM.giftForm.querySelector('button');

        // --- Client-side validation for immediate feedback ---
        if (!amount || amount <= 0) {
            return showToast('Please enter a valid amount to gift.', 'error');
        }
        if (appState.coins < amount) {
            return showToast('You do not have enough AwaqiCoins for that gift.', 'error');
        }

        giftButton.disabled = true;
        giftButton.textContent = 'Sending...';

        try {
            const data = await api.sendGift(amount);
            
            // Update state and UI on success
            appState.coins = data.newCoins;
            updateUI();
            
            DOM.giftAmountInput.value = ''; // Clear the input
            showToast(data.message, 'success');

        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            giftButton.disabled = false;
            giftButton.textContent = 'Send Gift';
        }
    });

    DOM.addVideoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = DOM.videoUrlInput.value;
        if (!url) return showToast("Please enter a YouTube URL.", "error");
        const submitButton = DOM.addVideoForm.querySelector('button');
        submitButton.disabled = true;
        try {
            const data = await api.addVideo(url);
            DOM.videoUrlInput.value = '';
            appState.coins = data.newCoins;
            appState.myVideos.push(data.newVideo);
            updateUI();
            renderMyVideosPage();
            showToast(data.message, "success");
        } catch (error) {
            showToast(error.message, "error");
        } finally {
            submitButton.disabled = false;
        }
    });

    DOM.confirmBoostBtn.addEventListener('click', async (e) => {
        const { videoId } = e.target.dataset;
        const boostLevel = document.getElementById('boost-level-select').value;
        e.target.disabled = true;
        try {
            const data = await api.boostVideo(videoId, parseInt(boostLevel, 10));
            appState.coins = data.newCoins;
            updateUI();
            hideModal(DOM.boostModal);
            showToast(data.message, "success");
        } catch (error) {
            showToast(error.message, "error");
        } finally {
            e.target.disabled = false;
        }
    });

    DOM.submitRefuseReasonBtn.addEventListener('click', async (e) => {
        const { subId } = e.target.dataset;
        const reason = document.getElementById('refuse-reason-textarea').value;
        if (!reason) return showToast("Please provide a reason.", "error");
        e.target.disabled = true;
        try {
            const data = await api.refuseSubscription(subId, reason);
            
            appState.coins = data.newCoins;
            updateUI();

            hideModal(DOM.refuseSubModal);
            appState.subscribers = appState.subscribers.filter(s => s._id !== subId);
            renderSubscribersPage();
            showToast(data.message, "success");
            document.getElementById('refuse-reason-textarea').value = '';

        } catch (error) {
            showToast(error.message, "error");
        } finally {
            e.target.disabled = false;
        }
    });

    DOM.copyReferralBtn.addEventListener('click', () => {
        const code = DOM.userReferralCode.textContent;
        if (navigator.clipboard && code && code !== 'LOADING...' && code !== 'N/A') {
            navigator.clipboard.writeText(code).then(() => {
                showToast('Referral code copied!', 'success');
            }).catch(() => {
                showToast('Failed to copy code.', 'error');
            });
        }
    });
    
    DOM.confirmPaymentBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const amount = document.getElementById('deposit-amount-input').value;
        const phone = document.getElementById('deposit-phone-input').value;

        if (!amount || !phone) {
            return showToast('Please enter both the amount and your phone number.', 'error');
        }
        if (parseInt(amount, 10) < 25) {
            return showToast('The minimum deposit amount is 25 ETB.', 'error');
        }
        
        const btn = e.target;
        btn.disabled = true;
        btn.textContent = 'Submitting...';

        try {
            const data = await api.requestPayment(amount, phone);
            showToast(data.message, 'success');
            document.getElementById('deposit-amount-input').value = '';
            document.getElementById('deposit-phone-input').value = '';
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Confirm Payment';
        }
    });

    DOM.searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const query = DOM.searchInput.value.trim();
        if (!query) return;

        const searchButton = DOM.searchForm.querySelector('button');
        searchButton.disabled = true;

        try {
            const results = await api.searchUsers(query);
            renderSearchResults(results, query);
        } catch (error) {
            showToast('An error occurred during search.', 'error');
        } finally {
            DOM.searchInput.value = '';
            searchButton.disabled = false;
        }
    });

    // ======== INITIALIZATION ========
    const initializeApp = async () => {
        if (appState.sessionToken && !eventSource) {
            eventSource = new EventSource(`${API_BASE_URL}/api/users/events?token=${appState.sessionToken}`);
            
            console.log('[SSE] Attempting to connect...');

            eventSource.onopen = () => {
                console.log('[SSE] Connection to server opened.');
            };

            eventSource.addEventListener('payment_update', (e) => {
                const data = JSON.parse(e.data);
                if (data.newCoins !== undefined) {
                    appState.coins = data.newCoins;
                    DOM.userCoins.textContent = data.newCoins;
                }
                const messageType = data.newCoins !== undefined ? 'success' : 'error';
                showToast(data.message, messageType);
            });

            eventSource.onerror = (err) => {
                console.error('[SSE] EventSource failed:', err);
                eventSource.close();
            };
        }

        if (appState.isNewUser) {
            setTimeout(startMandatorySubscription, 500);
        }
        
        try {
            const [sponsored, discover, myVideos, subscribers, notifications, subscribedIds] = await Promise.all([
                api.fetchSponsoredLinks(),
                api.fetchDiscoverLinks(),
                api.fetchMyVideos(),
                api.fetchSubscribers(),
                api.fetchNotifications(),
                api.fetchMySubscriptionIds()
            ]);
            
            appState.sponsoredLinks = sponsored;
            appState.discoverLinks = discover;
            appState.myVideos = myVideos;
            appState.subscribers = subscribers;
            appState.notifications = notifications;
            appState.subscribedToIds = subscribedIds;

            renderDiscoverPage();
            renderMyVideosPage();
            renderSubscribersPage();
            renderReferralInfo();
            renderSubscriptionUpdates();
            updateUI();
            showPage('discover-page');
            
        } catch (error) {
            showToast(`Error loading data: ${error.message}. Please refresh.`, 'error');
            handleLogout();
        }
    };
    
    const checkSession = async () => {
        const token = localStorage.getItem('sessionToken');
        if (token) {
            try {
                const data = await api.checkToken(token);
                appState.currentUser = data.user;
                appState.coins = data.user.coins;
                appState.sessionToken = token;
                appState.isNewUser = data.user.isNewUser;
                initializeApp();
            } catch (error) {
                handleLogout();
            }
        } else {
            updateUI();
        }
    };

    checkSession();
});