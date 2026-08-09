import {
  Frame,
  Layers3,
  Minus,
  Plus,
  Save,
  Trash2,
  View,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  CameraState,
  Entry,
  RepresentationSettings,
  Scene,
  ViewerSettings,
} from "../api/types";
import {
  addRepresentation,
  colorSchemes,
  removeRepresentation,
  representationStyles,
} from "../viewer/settings";
import { IconButton } from "./IconButton";

interface ViewerControlsProps {
  entries: Entry[];
  activeEntryId: string;
  camera: CameraState | null;
  scenes: Scene[];
  selectedCount: number;
  busy: boolean;
  isolated: boolean;
  onActiveEntry: (entryId: string) => void;
  onSettings: (entryId: string, settings: ViewerSettings) => void;
  onCameraMode: (mode: CameraState["mode"]) => void;
  onZoom: (factor: number) => void;
  onIsolation: (isolated: boolean) => void;
  onCreateScene: (name: string) => void;
  onApplyScene: (scene: Scene) => void;
  onDeleteScene: (scene: Scene) => void;
}

function updateRepresentation(
  settings: ViewerSettings,
  id: string,
  values: Partial<RepresentationSettings>,
): ViewerSettings {
  return {
    ...settings,
    representations: settings.representations.map((item) =>
      item.id === id ? { ...item, ...values } : item,
    ),
  };
}

export function ViewerControls(props: ViewerControlsProps) {
  const [open, setOpen] = useState(false);
  const [sceneName, setSceneName] = useState("");
  const active = props.entries.find((entry) => entry.id === props.activeEntryId);
  useEffect(() => {
    if (!active && props.entries[0]) props.onActiveEntry(props.entries[0].id);
  }, [active, props]);
  if (!active) return null;
  const settings = active.viewer_settings;

  return (
    <div className={`viewer-controls ${open ? "open" : ""}`}>
      <IconButton
        label={open ? "Close viewer controls" : "Open viewer controls"}
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={17} /> : <Layers3 size={17} />}
      </IconButton>
      {open ? (
        <div className="viewer-controls-panel">
          <div className="viewer-control-heading">
            <strong>Display</strong>
            <select
              aria-label="Controlled structure"
              value={active.id}
              onChange={(event) => props.onActiveEntry(event.target.value)}
            >
              {props.entries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>

          <div className="representation-list">
            {settings.representations.map((representation) => (
              <div className="representation-row" key={representation.id}>
                <select
                  aria-label={`Representation style for ${active.name}`}
                  value={representation.style}
                  onChange={(event) =>
                    props.onSettings(
                      active.id,
                      updateRepresentation(settings, representation.id, {
                        style: event.target.value as RepresentationSettings["style"],
                      }),
                    )
                  }
                >
                  {representationStyles.map((style) => (
                    <option key={style} value={style}>
                      {style}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Color scheme for ${representation.style}`}
                  value={representation.color_by}
                  onChange={(event) =>
                    props.onSettings(
                      active.id,
                      updateRepresentation(settings, representation.id, {
                        color_by: event.target.value as RepresentationSettings["color_by"],
                      }),
                    )
                  }
                >
                  {colorSchemes.map((scheme) => (
                    <option key={scheme} value={scheme}>
                      {scheme}
                    </option>
                  ))}
                </select>
                {representation.color_by === "custom" ? (
                  <input
                    type="color"
                    aria-label={`Custom color for ${representation.style}`}
                    value={representation.custom_color}
                    onChange={(event) =>
                      props.onSettings(
                        active.id,
                        updateRepresentation(settings, representation.id, {
                          custom_color: event.target.value,
                        }),
                      )
                    }
                  />
                ) : null}
                <label className="opacity-control">
                  <span>Opacity</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={representation.opacity}
                    onChange={(event) =>
                      props.onSettings(
                        active.id,
                        updateRepresentation(settings, representation.id, {
                          opacity: Number(event.target.value),
                        }),
                      )
                    }
                  />
                </label>
                <IconButton
                  label={`Remove ${representation.style} representation`}
                  disabled={settings.representations.length === 1 || props.busy}
                  onClick={() =>
                    props.onSettings(
                      active.id,
                      removeRepresentation(settings, representation.id),
                    )
                  }
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))}
          </div>
          <label>
            Add representation
            <select
              aria-label="Add representation"
              value=""
              onChange={(event) => {
                if (!event.target.value) return;
                props.onSettings(
                  active.id,
                  addRepresentation(
                    settings,
                    event.target.value as RepresentationSettings["style"],
                  ),
                );
              }}
            >
              <option value="">Choose style</option>
              {representationStyles.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend>Components</legend>
            <label className="check-label">
              <input
                type="checkbox"
                checked={settings.components.hydrogens}
                onChange={(event) =>
                  props.onSettings(active.id, {
                    ...settings,
                    components: {
                      ...settings.components,
                      hydrogens: event.target.checked,
                    },
                  })
                }
              />
              Show hydrogens
            </label>
            <div className="dependent-component-control">
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={settings.components.nonpolar_hydrogens}
                  disabled={!settings.components.hydrogens}
                  aria-describedby="nonpolar-hydrogens-help"
                  onChange={(event) =>
                    props.onSettings(active.id, {
                      ...settings,
                      components: {
                        ...settings.components,
                        nonpolar_hydrogens: event.target.checked,
                      },
                    })
                  }
                />
                Show non-polar hydrogens
              </label>
              <span id="nonpolar-hydrogens-help" className="viewer-control-help">
                Turn off to keep polar hydrogens only. Requires Show hydrogens.
              </span>
            </div>
            {(["protein", "ligands", "solvent", "ions"] as const).map((key) => (
              <label key={key} className="check-label">
                <input
                  type="checkbox"
                  checked={settings.components[key]}
                  onChange={(event) =>
                    props.onSettings(active.id, {
                      ...settings,
                      components: {
                        ...settings.components,
                        [key]: event.target.checked,
                      },
                    })
                  }
                />
                {key}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Labels</legend>
            {Object.entries(settings.labels).map(([key, value]) => (
              <label key={key} className="check-label">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(event) =>
                    props.onSettings(active.id, {
                      ...settings,
                      labels: { ...settings.labels, [key]: event.target.checked },
                    })
                  }
                />
                {key}
              </label>
            ))}
          </fieldset>

          <div className="camera-controls" aria-label="Viewer navigation">
            <div className="segmented-control">
              {(["perspective", "orthographic"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={props.camera?.mode === mode ? "active" : ""}
                  aria-pressed={props.camera?.mode === mode}
                  onClick={() => props.onCameraMode(mode)}
                >
                  {mode === "perspective" ? <View size={14} /> : <Frame size={14} />}
                  {mode}
                </button>
              ))}
            </div>
            <IconButton label="Zoom in" onClick={() => props.onZoom(0.8)}>
              <Plus size={15} />
            </IconButton>
            <IconButton label="Zoom out" onClick={() => props.onZoom(1.25)}>
              <Minus size={15} />
            </IconButton>
            <button
              type="button"
              className={props.isolated ? "active" : ""}
              disabled={props.selectedCount === 0 && !props.isolated}
              onClick={() => props.onIsolation(!props.isolated)}
            >
              {props.isolated ? "Show all" : "Isolate selection"}
            </button>
          </div>

          <form
            className="scene-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!sceneName.trim()) return;
              props.onCreateScene(sceneName.trim());
              setSceneName("");
            }}
          >
            <label>
              Named scenes
              <span className="input-with-button">
                <input
                  value={sceneName}
                  placeholder="Scene name"
                  maxLength={120}
                  onChange={(event) => setSceneName(event.target.value)}
                />
                <button
                  type="submit"
                  className="icon-submit"
                  aria-label="Save current scene"
                  disabled={!sceneName.trim() || !props.camera || props.busy}
                >
                  <Save size={15} />
                </button>
              </span>
            </label>
            <div className="scene-list">
              {props.scenes.map((scene) => (
                <div key={scene.id}>
                  <button type="button" onClick={() => props.onApplyScene(scene)}>
                    {scene.name}
                  </button>
                  <IconButton
                    label={`Delete scene ${scene.name}`}
                    onClick={() => props.onDeleteScene(scene)}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              ))}
              {props.scenes.length === 0 ? (
                <span className="empty-label">No named scenes</span>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
