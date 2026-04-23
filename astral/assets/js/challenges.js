import Alpine from "alpinejs";

import CTFd from "./index";

import { Modal, Tab, Tooltip } from "bootstrap";
import highlight from "./theme/highlight";
import { intl } from "./theme/times";

function addTargetBlank(html) {
  let dom = new DOMParser();
  let view = dom.parseFromString(html, "text/html");
  let links = view.querySelectorAll('a[href*="://"]');
  links.forEach(link => {
    link.setAttribute("target", "_blank");
  });
  return view.documentElement.outerHTML;
}

window.Alpine = Alpine;

Alpine.store("challenge", {
  data: {
    view: "",
  },
});

Alpine.data("Hint", () => ({
  id: null,
  html: null,

  async showHint(event) {
    if (event.target.open) {
      let response = await CTFd.pages.challenge.loadHint(this.id);

      if (response.errors) {
        event.target.open = false;
        CTFd._functions.challenge.displayUnlockError(response);
        return;
      }
      let hint = response.data;
      if (hint.content) {
        this.html = addTargetBlank(hint.html);
      } else {
        let answer = await CTFd.pages.challenge.displayUnlock(this.id);
        if (answer) {
          let unlock = await CTFd.pages.challenge.loadUnlock(this.id);

          if (unlock.success) {
            let response = await CTFd.pages.challenge.loadHint(this.id);
            let hint = response.data;
            this.html = addTargetBlank(hint.html);
          } else {
            event.target.open = false;
            CTFd._functions.challenge.displayUnlockError(unlock);
          }
        } else {
          event.target.open = false;
        }
      }
    }
  },
}));

Alpine.data("Challenge", () => ({
  id: null,
  next_id: null,
  submission: "",
  tab: null,
  solves: [],
  submissions: [],
  solution: null,
  solutionLoaded: false,
  response: null,
  share_url: null,
  max_attempts: 0,
  attempts: 0,
  ratingValue: 0,
  selectedRating: 0,
  ratingReview: "",
  ratingSubmitted: false,

  async init() {
    highlight();
  },

  getStyles() {
    let styles = {
      "modal-dialog": true,
    };
    try {
      let size = CTFd.config.themeSettings.challenge_window_size;
      switch (size) {
        case "sm":
          styles["modal-sm"] = true;
          break;
        case "lg":
          styles["modal-lg"] = true;
          break;
        case "xl":
          styles["modal-xl"] = true;
          break;
        default:
          break;
      }
    } catch (error) {
      console.log("Error processing challenge_window_size");
      console.log(error);
    }
    return styles;
  },

  async showChallenge() {
    new Tab(this.$el).show();
  },

  async showSolves() {
    this.solves = await CTFd.pages.challenge.loadSolves(this.id);
    this.solves.forEach(solve => {
      solve.date = intl.format(new Date(solve.date));
      return solve;
    });
    new Tab(this.$el).show();
  },

  async showSubmissions() {
    try {
      const response = await CTFd.fetch(
        `/api/v1/users/me/submissions?challenge_id=${this.id}`,
        { method: "GET" },
      );
      const data = await response.json();
      if (data.success && data.data) {
        this.submissions = data.data.map(s => {
          s.date = intl.format(new Date(s.date));
          return s;
        });
      }
    } catch (e) {
      console.log("Error loading submissions", e);
    }
    new Tab(this.$el).show();
  },

  getSolutionId() {
    let data = Alpine.store("challenge").data;
    return data.solution_id;
  },

  getSolvedByMe() {
    let data = Alpine.store("challenge").data;
    return data.solved_by_me;
  },

  async showSolution() {
    if (this.solutionLoaded) {
      new Tab(this.$el).show();
      return;
    }

    let solutionId = this.getSolutionId();
    if (!solutionId) return;

    try {
      let response = await CTFd.fetch(`/api/v1/solutions/${solutionId}`, {
        method: "GET",
      });
      let data = await response.json();

      if (data.success && data.data && data.data.html) {
        this.solution = data.data.html;
        this.solutionLoaded = true;
        new Tab(this.$el).show();
        return;
      }

      let unlockResponse = await CTFd.fetch("/api/v1/unlocks", {
        method: "POST",
        body: JSON.stringify({ target: solutionId, type: "solutions" }),
      });
      await unlockResponse.json();

      response = await CTFd.fetch(`/api/v1/solutions/${solutionId}`, {
        method: "GET",
      });
      data = await response.json();

      if (data.success && data.data && data.data.html) {
        this.solution = data.data.html;
        this.solutionLoaded = true;
      } else {
        this.solution =
          '<p class="text-center text-muted pt-3">Solution not available.</p>';
      }
    } catch (e) {
      this.solution =
        '<p class="text-center text-danger pt-3">Error loading solution.</p>';
    }
    new Tab(this.$el).show();
  },

  getNextId() {
    let data = Alpine.store("challenge").data;
    return data.next_id;
  },

  async nextChallenge() {
    let modal = Modal.getOrCreateInstance("[x-ref='challengeWindow']");

    modal._element.addEventListener(
      "hidden.bs.modal",
      event => {
        Alpine.nextTick(() => {
          this.$dispatch("load-challenge", this.getNextId());
        });
      },
      { once: true },
    );
    modal.hide();
  },

  async getShareUrl() {
    let body = {
      type: "solve",
      challenge_id: this.id,
    };
    const response = await CTFd.fetch("/api/v1/shares", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const data = await response.json();
    const url = data["data"]["url"];
    this.share_url = url;
  },

  copyShareUrl() {
    navigator.clipboard.writeText(this.share_url);
    let t = Tooltip.getOrCreateInstance(this.$el);
    t.enable();
    t.show();
    setTimeout(() => {
      t.hide();
      t.disable();
    }, 2000);
  },

  async submitChallenge() {
    this.response = await CTFd.pages.challenge.submitChallenge(
      this.id,
      this.submission,
    );

    if (this.response.data.status === "authentication_required") {
      window.location = `${CTFd.config.urlRoot}/login?next=${CTFd.config.urlRoot}${window.location.pathname}${window.location.hash}`;
      return;
    }

    await this.renderSubmissionResponse();
  },

  async renderSubmissionResponse() {
    if (this.response.data.status === "correct") {
      this.submission = "";
    }

    if (
      this.max_attempts > 0 &&
      this.response.data.status != "already_solved" &&
      this.response.data.status != "ratelimited"
    ) {
      this.attempts += 1;
    }

    this.$dispatch("load-challenges");
  },

  async submitRating() {
    try {
      const response = await CTFd.fetch(
        `/api/v1/challenges/${this.id}/ratings`,
        {
          method: "PUT",
          body: JSON.stringify({
            value: this.selectedRating,
            review: this.ratingReview || "",
          }),
        },
      );
      const data = await response.json();
      if (data.success) {
        this.ratingValue = this.selectedRating;
        this.ratingSubmitted = true;
      } else {
        alert("Error submitting rating");
      }
    } catch (e) {
      alert("Error submitting rating");
    }
  },
}));

Alpine.data("ChallengeBoard", () => ({
  loaded: false,
  challenges: [],
  challenge: null,

  async init() {
    this.challenges = await CTFd.pages.challenges.getChallenges();
    this.loaded = true;

    if (window.location.hash) {
      let chalHash = decodeURIComponent(window.location.hash.substring(1));
      let idx = chalHash.lastIndexOf("-");
      if (idx >= 0) {
        let pieces = [chalHash.slice(0, idx), chalHash.slice(idx + 1)];
        let id = pieces[1];
        await this.loadChallenge(id);
      }
    }
  },

  getCategories() {
    const categories = [];

    this.challenges.forEach(challenge => {
      const { category } = challenge;

      if (!categories.includes(category)) {
        categories.push(category);
      }
    });

    try {
      const f = CTFd.config.themeSettings.challenge_category_order;
      if (f) {
        const getSort = new Function(`return (${f})`);
        categories.sort(getSort());
      }
    } catch (error) {
      console.log("Error running challenge_category_order function");
      console.log(error);
    }

    return categories;
  },

  getChallenges(category) {
    let challenges = this.challenges;

    if (category !== null) {
      challenges = this.challenges.filter(
        challenge => challenge.category === category,
      );
    }

    try {
      const f = CTFd.config.themeSettings.challenge_order;
      if (f) {
        const getSort = new Function(`return (${f})`);
        challenges.sort(getSort());
      }
    } catch (error) {
      console.log("Error running challenge_order function");
      console.log(error);
    }

    return challenges;
  },

  async loadChallenges() {
    this.challenges = await CTFd.pages.challenges.getChallenges();
  },

  async loadChallenge(challengeId) {
    await CTFd.pages.challenge.displayChallenge(challengeId, challenge => {
      challenge.data.view = addTargetBlank(challenge.data.view);
      Alpine.store("challenge").data = challenge.data;

      Alpine.nextTick(() => {
        let modal = Modal.getOrCreateInstance("[x-ref='challengeWindow']");

        // Force Alpine to walk the newly-injected modal content so that
        // x-data="Challenge" children bind their handlers correctly. Without
        // this, @click="showSolution()"/"submitRating()" errors out because
        // Alpine's MutationObserver can race with x-html updates.
        Alpine.nextTick(() => {
          if (modal._element && typeof Alpine.initTree === "function") {
            try {
              Alpine.initTree(modal._element);
            } catch (e) {
              // Ignore if Alpine already initialized the subtree
            }
          }
        });

        modal._element.addEventListener(
          "hidden.bs.modal",
          event => {
            history.replaceState(null, null, " ");
          },
          { once: true },
        );
        modal.show();
        history.replaceState(
          null,
          null,
          `#${challenge.data.name}-${challengeId}`,
        );
      });
    });
  },
}));

Alpine.start();
