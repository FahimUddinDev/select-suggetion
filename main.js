// Reusable Autocomplete Input Class
class AutocompleteInput {
  constructor(inputId, suggestionsId, options = {}) {
    this.inputId = inputId;
    this.suggestionsId = suggestionsId;
    this.options = {
      onSelect: options.onSelect || (() => {}),
      onSearch: options.onSearch || null,
      debounceTime: options.debounceTime || 300,
      minSearchLength: options.minSearchLength || 0,
      defaultSelect: options.defaultSelect || null,
      acceptCustom: options.acceptCustom || false,
      initialDisabled: options.initialDisabled || false,
      disabledPlaceholder: options.disabledPlaceholder || null,
      ...options,
    };

    this.input = document.getElementById(inputId);
    this.suggestionsContainer = document.getElementById(suggestionsId);
    this.hiddenInput = this.getHiddenInput();
    this.errorMessage = this.input
      ?.closest(".error_wrapper")
      ?.querySelector(".error-message");
    this.dropdown = this.input?.parentElement?.querySelector("svg");

    this.suggestions = [];
    this.filteredSuggestions = [];
    this.isLoading = false;
    this.error = null;
    this.selectedIndex = -1;
    this.isOpen = false;
    this.currentValue = "";
    this.selectedItem = null;
    this.debounceTimer = null;

    if (!this.input) {
      console.error(`Input element not found: ${inputId}`);
      return;
    }
    if (!this.suggestionsContainer) {
      console.error(`Suggestions container not found: ${suggestionsId}`);
      return;
    }

    this.init();
  }

  getHiddenInput() {
    const wrapper = this.input?.closest(".error_wrapper");
    return wrapper?.querySelector('input[type="hidden"]');
  }

  init() {
    this.bindEvents();
    window.selectPendingEvent = false;
    // Store reference globally
    window.autocompleteInstances = window.autocompleteInstances || {};
    window.autocompleteInstances[this.inputId] = this;
    if (this.options.initialDisabled) {
      this.disable(this.options.disabledPlaceholder);
    }
  }

  bindEvents() {
    // Input events
    this.input.addEventListener("input", (e) => {
      this.handleInput(e);
    });

    this.input.addEventListener("focus", () => {
      this.handleFocus();
    });
    this.input.addEventListener("click", () => {
      if (!this.input.disabled && this.suggestions.length > 0) {
        this.filteredSuggestions = [...this.suggestions];
        this.selectedIndex = -1;
        this.showSuggestions();
      }
    });

    this.input.addEventListener("blur", (e) => {
      setTimeout(() => this.handleBlur(e), 200);
    });

    this.input.addEventListener("keydown", (e) => this.handleKeydown(e));

    // Document click to close suggestions
    document.addEventListener("click", (e) => {
      if (!this.input.closest(".error_wrapper")?.contains(e.target)) {
        this.hideSuggestions();
      }
    });
  }

  handleInput(e) {
    const value = e.target.value;
    this.currentValue = value;

    // Only clear selection if user is actually typing (not just focusing)
    if (this.selectedItem && value !== this.selectedItem.label) {
      this.selectedItem = null;
      if (this.hiddenInput) this.hiddenInput.value = "";
    }

    this.clearError();

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      if (
        this.options.onSearch &&
        typeof this.options.onSearch === "function"
      ) {
        this.handleAsyncSearch(value);
      } else {
        this.filterSuggestions(value);
        this.showSuggestions();
      }
    }, this.options.debounceTime);
  }

  async handleFocus() {
    if (
      window.selectPendingEvent &&
      typeof window.selectPendingEvent.then === "function" &&
      window.selectPendingEvent.origin !== this
    ) {
      await window.selectPendingEvent;
    }

    // Create a new pending promise and tag the origin
    window.selectPendingEvent = new Promise((resolve) => {
      window._resolveSelectPendingEvent = resolve;
    });
    window.selectPendingEvent.origin = this;

    if (this.dropdown) this.dropdown.style.transform = "rotate(180deg)";
    this.filteredSuggestions = [...this.suggestions];
    this.selectedIndex = -1;
    await this.showSuggestions();
  }
  handleBlur(e) {
    const searchValue = this.input.value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

    const selectedItem = this.suggestions.find(
      (item) => item.name.toLowerCase().replace(/\s+/g, " ") === searchValue
    );

    if (selectedItem) {
      this.selectItem(selectedItem);
    } else if (!this.options.acceptCustom) {
      this.input.value = "";
      if (this.hiddenInput) this.hiddenInput.value = "";
      this.options.onSelect();
    }

    if (
      !this.input.closest(".error_wrapper")?.contains(document.activeElement)
    ) {
      if (this.dropdown) this.dropdown.style.transform = "rotate(0deg)";
    }
    if (
      window.selectPendingEvent &&
      window.selectPendingEvent.origin === this &&
      typeof window._resolveSelectPendingEvent === "function"
    ) {
      window._resolveSelectPendingEvent();
      window._resolveSelectPendingEvent = null;
    }
  }

  handleKeydown(e) {
    if (!this.isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        this.navigateDown();
        break;
      case "ArrowUp":
        e.preventDefault();
        this.navigateUp();
        break;
      case "Enter":
        e.preventDefault();
        if (
          this.selectedIndex >= 0 &&
          this.filteredSuggestions[this.selectedIndex]
        ) {
          this.selectItem(this.filteredSuggestions[this.selectedIndex]);
        }
        break;
      case "Escape":
        this.hideSuggestions(`handle key down ${JSON.stringify(this)}`);
        this.input.blur();
        break;
    }
  }

  async handleAsyncSearch(query) {
    this.setLoading(true);
    this.clearError();

    try {
      const results = await this.options.onSearch(query);
      this.updateSuggestions(results);
      this.filterSuggestions(query);
      this.showSuggestions();
    } catch (error) {
      this.setError(error.message || "An error occurred while searching");
    } finally {
      this.setLoading(false);
    }
  }

  filterSuggestions(query) {
    if (!query || query.trim() === "") {
      this.filteredSuggestions = [...this.suggestions];
    } else {
      this.filteredSuggestions = this.suggestions.filter((item) =>
        item.name.toLowerCase().includes(query.toLowerCase())
      );
    }

    this.selectedIndex = -1;
  }

  async showSuggestions() {
    if (
      window.selectPendingEvent &&
      typeof window.selectPendingEvent.then === "function" &&
      window.selectPendingEvent.origin !== this
    ) {
      await window.selectPendingEvent;
    }
    this.isOpen = true;
    this.renderSuggestions();
    this.suggestionsContainer.classList.remove("hidden");
    this.suggestionsContainer.style.display = "block";
  }

  hideSuggestions() {
    this.isOpen = false;
    this.suggestionsContainer.classList.add("hidden");
    this.suggestionsContainer.style.display = "none";
    this.selectedIndex = -1;
  }

  renderSuggestions() {
    if (this.isLoading) {
      this.suggestionsContainer.innerHTML = `
                           <div class="p-4 text-center">
                               <div class="loading-spinner mx-auto"></div>
                               <p class="text-sm text-gray-500 mt-2">Loading...</p>
                           </div>
                       `;
      return;
    }

    if (this.error) {
      this.suggestionsContainer.innerHTML = `
                           <div class="p-4 text-center text-red-500">
                               <p class="text-sm">${this.error}</p>
                           </div>
                       `;
      return;
    }

    if (this.filteredSuggestions.length === 0) {
      this.suggestionsContainer.innerHTML = `
                           <div class="p-4 text-center text-gray-500">
                               <p class="text-sm">No data found</p>
                           </div>
                       `;
      return;
    }

    const suggestionsHTML = this.filteredSuggestions
      .map((item, index) => {
        return `
                           <div
                               class="suggestion-item px-4 py-3 cursor-pointer border-b border-gray-100 last:border-b-0 ${
                                 index === this.selectedIndex ? "selected" : ""
                               }"
                               data-index="${index}"
                               onmousedown="event.preventDefault(); window.selectSuggestion('${
                                 this.inputId
                               }', ${index})"
                           >
                               <div class="font-medium">${item.name}</div>
                               ${
                                 item.description
                                   ? `<div class="text-sm text-gray-500">${item.description}</div>`
                                   : ""
                               }
                           </div>
                       `;
      })
      .join("");

    this.suggestionsContainer.innerHTML = suggestionsHTML;
  }

  navigateDown() {
    if (this.selectedIndex < this.filteredSuggestions.length - 1) {
      this.selectedIndex++;
      this.updateSelection();
    }
  }

  navigateUp() {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
      this.updateSelection();
    } else if (this.selectedIndex === 0) {
      this.selectedIndex = -1;
      this.updateSelection();
    }
  }

  updateSelection() {
    const items =
      this.suggestionsContainer.querySelectorAll(".suggestion-item");
    items.forEach((item, index) => {
      if (index === this.selectedIndex) {
        item.classList.add("selected");
        item.scrollIntoView({ block: "nearest" });
      } else {
        item.classList.remove("selected");
      }
    });
  }

  selectItem(item) {
    this.selectedItem = item;
    this.currentValue = item.name;
    this.input.value = item.name;
    if (this.hiddenInput) this.hiddenInput.value = item.id;
    this.hideSuggestions();
    this.clearError();
    // Call onSelect callback
    if (this.options.onSelect) {
      this.options.onSelect(item, this);
    }
    this.input.blur();
  }

  // Public API methods
  setSuggestions(suggestions) {
    this.suggestions = suggestions || [];
    this.checkDefaultSelect();
  }

  checkDefaultSelect() {
    if (this.options.defaultSelect && this.suggestions.length > 0) {
      const defaultItem = this.suggestions.find(
        (item) => item.id == this.options.defaultSelect
      );

      if (defaultItem) {
        this.setValue(defaultItem, true);
        this.options.defaultSelect = null;
      }
    }
  }

  updateSuggestions(newSuggestions) {
    this.setSuggestions(newSuggestions);
  }

  setLoading(loading) {
    this.isLoading = loading;
    if (this.isOpen) {
      this.renderSuggestions();
    }
  }

  setError(error) {
    this.error = error;
    this.showError(error);
    if (this.isOpen) {
      this.renderSuggestions();
    }
  }

  clearError() {
    this.error = null;
    this.hideError();
  }

  showError(message) {
    if (this.errorMessage) {
      this.errorMessage.textContent = message;
      this.errorMessage.classList.remove("hidden");
      this.input.classList.add("error-border");
    }
  }

  hideError() {
    if (this.errorMessage) {
      this.errorMessage.classList.add("hidden");
      this.input.classList.remove("error-border");
    }
  }

  getValue() {
    return {
      label: this.currentValue,
      value: this.hiddenInput ? this.hiddenInput.value : "",
      item: this.selectedItem,
    };
  }

  setValue(item, triggerCallback = true) {
    if (item) {
      this.selectedItem = item;
      this.currentValue = item.name;
      this.input.value = item.name;
      if (this.hiddenInput) this.hiddenInput.value = item.id;
      this.clearError();

      if (triggerCallback && this.options.onSelect) {
        this.options.onSelect(item, this);
      }
    } else {
      this.clear();
    }
  }

  clear() {
    this.input.value = "";
    if (this.hiddenInput) this.hiddenInput.value = "";
    this.currentValue = "";
    this.selectedItem = null;
    this.hideSuggestions(`clear ${JSON.stringify(this)}`);
    this.clearError();
  }

  enable() {
    this.input.disabled = false;
    this.input.classList.remove("cursor-progress");
    this.input.placeholder = this.input.placeholder.replace(
      "First select",
      "Select"
    );
    if (this.options.disabledPlaceholder) {
      // Restore original placeholder if it was changed
      this.input.placeholder = this.input.placeholder.replace(
        this.options.disabledPlaceholder,
        this.input.getAttribute("data-original-placeholder") || "Select"
      );
    }
  }

  disable() {
    this.input.disabled = true;
    this.input.classList.add("cursor-progress");
    this.input.classList.add("pointer-event-none");
    this.clear();
    if (this.disabledPlaceholder) {
      // Store original placeholder if not already stored
      if (!this.input.getAttribute("data-original-placeholder")) {
        this.input.setAttribute(
          "data-original-placeholder",
          this.input.placeholder
        );
      }
      this.input.placeholder = disabledPlaceholder;
    }
  }
  createPendingEvent() {
    let resolveFunc;
    const promise = new Promise((resolve) => (resolveFunc = resolve));
    promise.resolve = resolveFunc;
    return promise;
  }
}

// Global helper function for selection
window.selectSuggestion = function (inputId, index) {
  const instance = window.autocompleteInstances[inputId];
  if (instance && instance.filteredSuggestions[index]) {
    instance.selectItem(instance.filteredSuggestions[index]);
  }
};

// Helper functions
async function clearDependentFields(fieldNames) {
  await fieldNames.forEach((fieldName) => {
    const inputId = fieldName + "Input";
    if (window.autocompleteInstances[inputId]) {
      window.autocompleteInstances[inputId].disable();
      window.autocompleteInstances[inputId].setSuggestions([]);
    }
  });
}

function updateSelectedValuesDisplay() {
  const selectedValues = document.getElementById("selectedValues");
  const values = [];

  const fields = ["test", "country", "state", "city", "town"];
  fields.forEach((field) => {
    const inputId = field + "Input";
    const instance = window.autocompleteInstances[inputId];
    if (instance) {
      const value = instance.getValue();
      if (value.item) {
        values.push(
          `<div><strong>${
            field.charAt(0).toUpperCase() + field.slice(1)
          }:</strong> ${value.label} (${value.value})</div>`
        );
      }
    }
  });

  selectedValues.innerHTML =
    values.length > 0
      ? values.join("")
      : '<div class="text-gray-400">No selections made</div>';
}

function getFormData() {
  const formData = {};
  Object.keys(window.autocompleteInstances).forEach((key) => {
    const instance = window.autocompleteInstances[key];
    const value = instance.getValue();
    if (value.item) {
      formData[key] = value;
    }
  });
  alert("Check console for form data");
}

// Test function to show empty state
function testEmptyState() {
  // Clear suggestions to show "No data found"
  window.autocompleteInstances["testInput"].setSuggestions([]);
  window.autocompleteInstances["testInput"].input.focus();
}

// Test function to restore data
function restoreTestData() {
  window.autocompleteInstances["testInput"].setSuggestions(testProducts);
}
