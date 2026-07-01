// 29 个 non-skill 工具的静态 JSON Schema，用于参数类型推断、--list / --help 渲染。
// 内容来源于 mcp-bridge/src/tool-schemas.ts，已裁剪掉 organize_tabs、download_text_as_markdown
// 等未启用工具，以及 6 个 skill_* 工具（后者需 QuickJS/emscripten VM，与本插件轻量化目标冲突）。

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const toolSchemas: ToolSchema[] = [
  // ===== Tab Management (7) =====
  {
    name: "get_all_tabs",
    description:
      "Get all open tabs across all windows with their IDs, titles, and URLs",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_current_tab",
    description: "Get information about the currently active tab",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "switch_to_tab",
    description: "Switch to a specific tab by ID",
    inputSchema: {
      type: "object",
      properties: {
        tabId: {
          type: "number",
          description: "The ID of the tab to switch to",
        },
      },
      required: ["tabId"],
    },
  },
  {
    name: "create_new_tab",
    description: "Create a new tab with the specified URL",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to open in the new tab" },
      },
      required: ["url"],
    },
  },
  {
    name: "get_tab_info",
    description: "Get detailed information about a specific tab",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the tab" },
      },
      required: ["tabId"],
    },
  },
  {
    name: "close_tab",
    description: "Close a specific tab",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the tab to close" },
      },
      required: ["tabId"],
    },
  },
  {
    name: "ungroup_tabs",
    description: "Remove all tab groups in the current window",
    inputSchema: { type: "object", properties: {}, required: [] },
  },

  // ===== UI Operations (9) =====
  {
    name: "take_snapshot",
    description:
      "Capture the full accessibility-style DOM snapshot for a tab. Returns the complete formatted tree with element UIDs for reading or follow-up interaction.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the tab to snapshot" },
      },
      required: ["tabId"],
    },
  },
  {
    name: "search_elements",
    description:
      "Search elements on a page using glob/grep patterns against the DOM snapshot; returns matching elements with UIDs.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the tab" },
        query: { type: "string", description: "Search query (glob/grep)" },
        contextLevels: {
          type: "number",
          description: "Number of context lines to include",
        },
      },
      required: ["tabId", "query"],
    },
  },
  {
    name: "click",
    description: "Click an element using its unique UID from a snapshot",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the tab" },
        uid: { type: "string", description: "Element UID from snapshot" },
        dblClick: {
          type: "boolean",
          description: "Set true for double clicks",
        },
      },
      required: ["tabId", "uid"],
    },
  },
  {
    name: "fill_element_by_uid",
    description: "Fill an input element using its unique UID from a snapshot",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the tab" },
        uid: { type: "string", description: "UID of the element to fill" },
        value: { type: "string", description: "Value to fill" },
      },
      required: ["tabId", "uid", "value"],
    },
  },
  {
    name: "get_editor_value",
    description:
      "Get complete content from a code editor (Monaco/CodeMirror/ACE) or textarea without truncation.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the tab" },
        uid: { type: "string", description: "UID of the editor element" },
      },
      required: ["tabId", "uid"],
    },
  },
  {
    name: "fill_form",
    description: "Fill multiple form elements at once using UIDs",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the tab" },
        elements: {
          type: "array",
          description: "Array of { uid, value } items",
        },
      },
      required: ["tabId", "elements"],
    },
  },
  {
    name: "hover_element_by_uid",
    description: "Hover over an element using its UID from a snapshot",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the tab" },
        uid: { type: "string", description: "Element UID" },
      },
      required: ["tabId", "uid"],
    },
  },
  {
    name: "upload_file_to_input",
    description:
      "Upload a pre-attached or absolute-path file to a file input on the page.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "The ID of the tab" },
        uid: { type: "string", description: "UID of the <input type=file>" },
        input_index: {
          type: "number",
          description: "0-based index when multiple file inputs exist",
        },
        file_id: { type: "string", description: "Pre-attached file ref id" },
        file_path: {
          type: "string",
          description: "Absolute local file path to upload via CDP",
        },
      },
      required: ["tabId"],
    },
  },
  {
    name: "computer",
    description:
      "Coordinate-based mouse/keyboard fallback (left_click/right_click/type/scroll/key/drag/scroll_to/hover).",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "left_click",
            "right_click",
            "type",
            "scroll",
            "key",
            "left_click_drag",
            "double_click",
            "triple_click",
            "scroll_to",
            "hover",
          ],
          description: "The action to perform",
        },
        coordinate: {
          type: "array",
          description: "[x, y] in screenshot pixels",
        },
        text: { type: "string", description: "Text or key combo" },
        start_coordinate: {
          type: "array",
          description: "Drag start [x, y]",
        },
        scroll_direction: {
          type: "string",
          enum: ["up", "down", "left", "right"],
        },
        scroll_amount: {
          type: "number",
          description: "Pixels to scroll (default ~2 viewport heights)",
        },
        tabId: { type: "number", description: "Target tab ID" },
        uid: { type: "string", description: "Element UID for scroll_to" },
      },
      required: ["action"],
    },
  },

  // ===== Page Tools (4) =====
  {
    name: "get_page_metadata",
    description:
      "Get page metadata including title, description, keywords, etc.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "scroll_to_element",
    description: "Scroll to a DOM element and center it in the viewport",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector" },
      },
      required: ["selector"],
    },
  },
  {
    name: "highlight_element",
    description: "Highlight DOM elements with drop shadow effect",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector" },
        color: { type: "string", description: "Shadow color, e.g. '#00d4ff'" },
        duration: { type: "number", description: "Duration ms (0=permanent)" },
        intensity: { type: "string", enum: ["subtle", "normal", "strong"] },
        persist: { type: "boolean", description: "Keep highlight permanently" },
      },
      required: ["selector"],
    },
  },
  {
    name: "highlight_text_inline",
    description:
      "Highlight specific words or phrases within text content using inline styling",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector" },
        searchText: { type: "string", description: "Text to highlight" },
        caseSensitive: { type: "boolean" },
        wholeWords: { type: "boolean" },
        highlightColor: { type: "string" },
        backgroundColor: { type: "string" },
        fontWeight: { type: "string" },
        persist: { type: "boolean" },
      },
      required: ["selector", "searchText"],
    },
  },

  // ===== Screenshot (3) =====
  {
    name: "capture_screenshot",
    description: "Capture screenshot of current visible tab.",
    inputSchema: {
      type: "object",
      properties: {
        sendToLLM: {
          type: "boolean",
          description: "Send image to LLM for visual analysis",
        },
      },
      required: [],
    },
  },
  {
    name: "capture_screenshot_with_highlight",
    description:
      "Capture screenshot with a highlight overlay around a specified element.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Target tab ID" },
        uid: { type: "string", description: "Element UID" },
        sendToLLM: { type: "boolean" },
      },
      required: ["tabId", "uid"],
    },
  },
  {
    name: "capture_tab_screenshot",
    description: "Capture screenshot of a specific tab by ID.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Target tab ID" },
        sendToLLM: { type: "boolean" },
      },
      required: ["tabId"],
    },
  },

  // ===== Download (2) =====
  {
    name: "download_image",
    description: "Download an image from base64 data to local filesystem",
    inputSchema: {
      type: "object",
      properties: {
        imageData: { type: "string", description: "data:image/... base64 URL" },
        filename: { type: "string", description: "Filename without extension" },
        folderPath: { type: "string", description: "Optional folder path" },
      },
      required: ["imageData"],
    },
  },
  {
    name: "download_chat_images",
    description:
      "Download multiple images from chat messages to local filesystem",
    inputSchema: {
      type: "object",
      properties: {
        messages: { type: "array", description: "Chat messages with images" },
        folderPrefix: { type: "string", description: "Folder name prefix" },
        filenamingStrategy: {
          type: "string",
          enum: ["descriptive", "sequential", "timestamp"],
        },
        displayResults: { type: "boolean" },
      },
      required: ["messages"],
    },
  },

  // ===== Intervention (4) =====
  {
    name: "list_interventions",
    description: "List all available human intervention tools",
    inputSchema: {
      type: "object",
      properties: {
        enabledOnly: {
          type: "boolean",
          description: "Only return enabled interventions",
        },
      },
      required: [],
    },
  },
  {
    name: "get_intervention_info",
    description: "Get detailed information about a specific intervention type",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Intervention type identifier",
        },
      },
      required: ["type"],
    },
  },
  {
    name: "request_intervention",
    description: "Request human intervention during task execution",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "Intervention type" },
        params: { description: "Type-specific parameters" },
        timeout: {
          type: "number",
          description: "Timeout seconds (default 300)",
        },
        reason: { type: "string", description: "Explanation shown to user" },
      },
      required: ["type"],
    },
  },
  {
    name: "cancel_intervention",
    description: "Cancel the currently active intervention request",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Intervention ID to cancel" },
      },
      required: [],
    },
  },
];
