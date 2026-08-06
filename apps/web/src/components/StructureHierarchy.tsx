import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { molecularApi } from "../api/client";
import type {
  ComponentCategory,
  Entry,
  MolecularComponent,
  Selection,
  SelectionMode,
  ViewerSettings,
} from "../api/types";
import {
  categorySelection,
  componentAtomIds,
  componentSelection,
  selectedState,
} from "../selection/components";
import { selectionMode } from "../selection/selection";
import { IconButton } from "./IconButton";

type VisibilityKey = keyof Omit<ViewerSettings["components"], "hydrogens">;

interface StructureHierarchyProps {
  projectId: string;
  entry: Entry;
  selection: Selection;
  onSelect: (selection: Selection, mode: SelectionMode) => void;
  onVisibility: (entry: Entry, key: VisibilityKey) => void;
}

interface CategoryDefinition {
  category: ComponentCategory;
  label: string;
  visibility?: VisibilityKey;
}

const GROUPS: { label: string; categories: CategoryDefinition[] }[] = [
  {
    label: "Polymers",
    categories: [
      { category: "protein", label: "Protein", visibility: "protein" },
      { category: "dna", label: "DNA" },
      { category: "rna", label: "RNA" },
      { category: "other_polymer", label: "Other polymer" },
    ],
  },
  {
    label: "Ligands / cofactors",
    categories: [
      { category: "ligand", label: "Ligands / cofactors", visibility: "ligands" },
    ],
  },
  {
    label: "Solvent",
    categories: [
      { category: "water", label: "Water", visibility: "solvent" },
      {
        category: "solvent",
        label: "Other solvent / additives",
        visibility: "solvent",
      },
    ],
  },
  {
    label: "Ions / metals",
    categories: [{ category: "ion", label: "Ions / metals", visibility: "ions" }],
  },
  {
    label: "Other / unclassified",
    categories: [
      { category: "other_heterogen", label: "Other heterogens" },
      { category: "unclassified", label: "Unclassified" },
    ],
  },
];

const sourceExplanation = {
  source: "Assigned from source entity or polymer metadata",
  fallback: "Assigned by a documented residue or element fallback",
  ambiguous: "The available evidence does not support a narrower assignment",
} as const;

function LoadedHierarchy({
  projectId,
  entry,
  selection,
  onSelect,
  onVisibility,
}: StructureHierarchyProps) {
  const [openCategories, setOpenCategories] = useState<Set<ComponentCategory>>(
    new Set(),
  );
  const query = useQuery({
    queryKey: ["structure", projectId, entry.id, entry.current_artifact_id],
    queryFn: () => molecularApi.structure(projectId, entry.id),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const grouped = useMemo(() => {
    if (!query.data) return [];
    return GROUPS.map((group) => ({
      ...group,
      categories: group.categories
        .map((definition) => ({
          ...definition,
          components: query.data.hierarchy.components.filter(
            (component) => component.category === definition.category,
          ),
        }))
        .filter((category) => category.components.length > 0),
    })).filter((group) => group.categories.length > 0);
  }, [query.data]);

  if (query.isPending) {
    return (
      <div className="hierarchy-loading" role="status">
        <LoaderCircle size={14} /> Loading components
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="hierarchy-error" role="alert">
        Component hierarchy unavailable
      </div>
    );
  }

  const { hierarchy, structure } = query.data;
  return (
    <div className="hierarchy-groups">
      {hierarchy.warnings.map((warning) => (
        <p className="hierarchy-warning" key={`${warning.code}:${warning.message}`}>
          <AlertTriangle size={13} aria-hidden="true" /> {warning.message}
        </p>
      ))}
      {grouped.map((group) => (
        <section className="hierarchy-group" aria-label={group.label} key={group.label}>
          <h4>{group.label}</h4>
          {group.categories.map((category) => {
            const categoryOperand = categorySelection(
              entry.id,
              structure,
              hierarchy,
              category.category,
            );
            const open = openCategories.has(category.category);
            const visibility = category.visibility;
            const visible = visibility
              ? entry.viewer_settings.components[visibility]
              : undefined;
            return (
              <details
                className="hierarchy-category"
                key={category.category}
                open={open}
                onToggle={(event) => {
                  const isOpen = event.currentTarget.open;
                  setOpenCategories((current) => {
                    const next = new Set(current);
                    if (isOpen) next.add(category.category);
                    else next.delete(category.category);
                    return next;
                  });
                }}
              >
                <summary>
                  <ChevronDown size={13} aria-hidden="true" />
                  <span>{category.label}</span>
                  <small>
                    {category.components.length} / {categoryOperand.atoms.length} atoms
                  </small>
                </summary>
                <div className="hierarchy-category-actions">
                  <button
                    type="button"
                    className="hierarchy-select"
                    aria-label={`Select ${category.label} in ${entry.name}`}
                    aria-pressed={selectedState(selection, categoryOperand)}
                    onClick={(event) =>
                      onSelect(categoryOperand, selectionMode(event.nativeEvent))
                    }
                  >
                    Select category
                  </button>
                  {visibility ? (
                    <IconButton
                      label={`${visible ? "Hide" : "Show"} ${category.label} visibility group in ${entry.name}`}
                      onClick={() => onVisibility(entry, visibility)}
                    >
                      {visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </IconButton>
                  ) : null}
                </div>
                {open ? (
                  <div className="hierarchy-components">
                    {category.components.map((component: MolecularComponent) => {
                      const operand = componentSelection(entry.id, structure, component);
                      const atomCount = componentAtomIds(structure, component).length;
                      return (
                        <button
                          type="button"
                          className="hierarchy-component"
                          key={component.id}
                          aria-pressed={selectedState(selection, operand)}
                          aria-describedby={`${entry.id}-${component.id}-source`}
                          onClick={(event) =>
                            onSelect(operand, selectionMode(event.nativeEvent))
                          }
                        >
                          <span>{component.display_label}</span>
                          <small>{atomCount} atoms</small>
                          <span
                            className={`classification-source ${component.classification_source}`}
                            id={`${entry.id}-${component.id}-source`}
                          >
                            {sourceExplanation[component.classification_source]}
                          </span>
                          {component.warnings.map((warning) => (
                            <span className="component-warning" key={warning.message}>
                              <AlertTriangle size={12} aria-hidden="true" /> {warning.message}
                            </span>
                          ))}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </details>
            );
          })}
        </section>
      ))}
    </div>
  );
}

export function StructureHierarchy(props: StructureHierarchyProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details
      className="structure-hierarchy"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary aria-label={`Component hierarchy for ${props.entry.name}`}>
        <ChevronDown size={14} aria-hidden="true" /> Components
      </summary>
      {expanded ? <LoadedHierarchy {...props} /> : null}
    </details>
  );
}
