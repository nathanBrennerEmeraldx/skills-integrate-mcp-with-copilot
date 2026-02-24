document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const messageDiv = document.getElementById("message");
  const authStatus = document.getElementById("auth-status");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const logoutButton = document.getElementById("logout-btn");
  const roleDashboard = document.getElementById("role-dashboard");
  const roleNav = document.getElementById("role-nav");
  const roleNavLinks = document.getElementById("role-nav-links");

  let authToken = localStorage.getItem("authToken") || "";
  let currentUser = null;

  const roleLinks = {
    member: ["My Activities", "My Complaints", "My Feedback"],
    admin: ["Assigned Club Complaints", "Respond to Complaints", "Resolution Notes"],
    supervisor: ["Club Management", "Admin Management", "System Overview"],
  };

  function setMessage(text, type) {
    messageDiv.textContent = text;
    messageDiv.className = type;
    messageDiv.classList.remove("hidden");

    setTimeout(() => {
      messageDiv.classList.add("hidden");
    }, 5000);
  }

  function setRoleRoute(role) {
    const roleRoutes = {
      member: "member-dashboard",
      admin: "admin-dashboard",
      supervisor: "supervisor-dashboard",
    };

    if (roleRoutes[role]) {
      window.location.hash = roleRoutes[role];
    }
  }

  function renderRoleNavigation(role) {
    const links = roleLinks[role] || [];
    roleNavLinks.innerHTML = "";

    links.forEach((label) => {
      const listItem = document.createElement("li");
      listItem.textContent = label;
      roleNavLinks.appendChild(listItem);
    });
  }

  function updateAuthUI() {
    const isLoggedIn = Boolean(currentUser && authToken);

    if (!isLoggedIn) {
      authStatus.textContent = "Not logged in";
      authStatus.className = "info";
      loginForm.classList.remove("hidden");
      registerForm.classList.remove("hidden");
      logoutButton.classList.add("hidden");
      roleDashboard.classList.add("hidden");
      roleNav.classList.add("hidden");
      return;
    }

    authStatus.textContent = `Logged in as ${currentUser.email} (${currentUser.role})`;
    authStatus.className = "success";
    loginForm.classList.add("hidden");
    registerForm.classList.add("hidden");
    logoutButton.classList.remove("hidden");
    roleDashboard.textContent = `Current dashboard: ${currentUser.role}`;
    roleDashboard.classList.remove("hidden");
    roleNav.classList.remove("hidden");
    renderRoleNavigation(currentUser.role);
    setRoleRoute(currentUser.role);
  }

  async function authedFetch(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    return fetch(url, { ...options, headers });
  }

  async function fetchCurrentUser() {
    if (!authToken) {
      currentUser = null;
      updateAuthUI();
      return;
    }

    try {
      const response = await authedFetch("/auth/me");
      if (!response.ok) {
        throw new Error("Session expired");
      }

      currentUser = await response.json();
    } catch {
      authToken = "";
      currentUser = null;
      localStorage.removeItem("authToken");
    }

    updateAuthUI();
  }

  // Function to fetch activities from API
  async function fetchActivities() {
    try {
      const response = await fetch("/activities");
      const activities = await response.json();

      // Clear loading message
      activitiesList.innerHTML = "";

      // Populate activities list
      activitySelect.innerHTML = '<option value="">-- Select an activity --</option>';

      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";

        const spotsLeft =
          details.max_participants - details.participants.length;

        // Create participants HTML with delete icons instead of bullet points
        const participantsHTML =
          details.participants.length > 0
            ? `<div class="participants-section">
              <h5>Participants:</h5>
              <ul class="participants-list">
                ${details.participants
                  .map(
                    (email) =>
                      `<li><span class="participant-email">${email}</span><button class="delete-btn" data-activity="${name}" data-email="${email}">❌</button></li>`
                  )
                  .join("")}
              </ul>
            </div>`
            : `<p><em>No participants yet</em></p>`;

        activityCard.innerHTML = `
          <h4>${name}</h4>
          <p>${details.description}</p>
          <p><strong>Schedule:</strong> ${details.schedule}</p>
          <p><strong>Availability:</strong> ${spotsLeft} spots left</p>
          <div class="participants-container">
            ${participantsHTML}
          </div>
        `;

        activitiesList.appendChild(activityCard);

        // Add option to select dropdown
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });

      // Add event listeners to delete buttons
      document.querySelectorAll(".delete-btn").forEach((button) => {
        button.addEventListener("click", handleUnregister);
      });
    } catch (error) {
      activitiesList.innerHTML =
        "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  // Handle unregister functionality
  async function handleUnregister(event) {
    if (!currentUser) {
      setMessage("Please log in before unregistering students.", "error");
      return;
    }

    const button = event.target;
    const activity = button.getAttribute("data-activity");
    const email = button.getAttribute("data-email");

    try {
      const response = await authedFetch(
        `/activities/${encodeURIComponent(
          activity
        )}/unregister?email=${encodeURIComponent(email)}`,
        {
          method: "DELETE",
        }
      );

      const result = await response.json();

      if (response.ok) {
        setMessage(result.message, "success");

        // Refresh activities list to show updated participants
        fetchActivities();
      } else {
        setMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      setMessage("Failed to unregister. Please try again.", "error");
      console.error("Error unregistering:", error);
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.detail || "Login failed", "error");
        return;
      }

      authToken = result.token;
      currentUser = result.user;
      localStorage.setItem("authToken", authToken);
      loginForm.reset();
      updateAuthUI();
      setMessage(result.message, "success");
      fetchActivities();
    } catch (error) {
      setMessage("Failed to log in. Please try again.", "error");
      console.error("Error logging in:", error);
    }
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("register-email").value;
    const password = document.getElementById("register-password").value;

    try {
      const response = await fetch("/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, role: "member" }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.detail || "Registration failed", "error");
        return;
      }

      registerForm.reset();
      setMessage("Registration successful. Please log in.", "success");
    } catch (error) {
      setMessage("Failed to register. Please try again.", "error");
      console.error("Error registering:", error);
    }
  });

  logoutButton.addEventListener("click", async () => {
    if (!authToken) {
      return;
    }

    try {
      await authedFetch("/auth/logout", { method: "POST" });
    } catch {
      // No-op; local logout still proceeds.
    }

    authToken = "";
    currentUser = null;
    localStorage.removeItem("authToken");
    updateAuthUI();
    setMessage("Logged out successfully", "info");
  });

  // Handle form submission
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser) {
      setMessage("Please log in before signing up for activities.", "error");
      return;
    }

    const email = document.getElementById("email").value;
    const activity = document.getElementById("activity").value;

    try {
      const response = await authedFetch(
        `/activities/${encodeURIComponent(
          activity
        )}/signup?email=${encodeURIComponent(email)}`,
        {
          method: "POST",
        }
      );

      const result = await response.json();

      if (response.ok) {
        setMessage(result.message, "success");
        signupForm.reset();

        // Refresh activities list to show updated participants
        fetchActivities();
      } else {
        setMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      setMessage("Failed to sign up. Please try again.", "error");
      console.error("Error signing up:", error);
    }
  });

  // Initialize app
  fetchCurrentUser();
  fetchActivities();
});
