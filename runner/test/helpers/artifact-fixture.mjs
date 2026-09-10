export function artifactFixture() {
  const wireflow = {
    title: 'Synthetic save flow',
    jtbds: ['01'],
    lanes: ['Editor', 'App'],
    journeys: [
      {
        id: 'J-SAVE',
        title: 'Save changes',
        actor: 'Editor',
        jtbd: '01',
        jtbds: ['01'],
        start: 'Unsaved changes',
        outcome: 'Persisted changes',
        lanes: ['Editor', 'App'],
        nodes: [
          { id: 'N-START', col: 0, lane: 'Editor', type: 'start', text: 'Unsaved changes' },
          {
            id: 'N-SAVE',
            pageId: 'P1',
            col: 1,
            lane: 'App',
            type: 'screen',
            text: 'Save form',
            href: '/save',
          },
          { id: 'N-DONE', col: 2, lane: 'Editor', type: 'outcome', text: 'Saved' },
        ],
        edges: [
          { id: 'E-OPEN', from: 'N-START', to: 'N-SAVE', trigger: 'open', label: 'Open' },
          { id: 'E-SAVE', from: 'N-SAVE', to: 'N-DONE', trigger: 'save', label: 'Save' },
        ],
      },
    ],
  }
  const pages = {
    title: 'Synthetic page brief',
    jtbds: { '01': { statement: 'Preserve my work', persona: 'Editor' } },
    pages: [
      {
        id: 'P1',
        name: 'Save form',
        route: '/save',
        responsibilities: 'Persist pending edits under the accepted contract.',
        requirementIds: ['R-ROUNDTRIP'],
        obligationIds: ['OBL-SCREEN', 'OBL-STUDY'],
        checklist: [{ text: 'Save pending edits', jobs: ['01'] }],
        appears_in: [{ journey: 'J-SAVE', step: 'N-SAVE' }],
        connects: [],
        acceptance: {
          factual: ['A failed save retains pending edits for retry'],
          qualitative: ['Can the editor explain whether changes are saved?'],
        },
      },
    ],
  }
  const components = {
    schemaVersion: 1,
    components: [
      {
        id: 'C-SAVE',
        pageId: 'P1',
        requirementIds: ['R-ROUNDTRIP'],
        obligationIds: ['OBL-CODE', 'OBL-SCREEN'],
        states: {
          empty: { status: 'applicable', behavior: 'Show an empty editable value' },
          loading: {
            status: 'applicable',
            behavior: 'Show saving status and retain editable draft',
          },
          error: { status: 'applicable', behavior: 'Retain edits and offer retry' },
          populated: { status: 'applicable', behavior: 'Show persisted value and saved status' },
        },
      },
    ],
  }
  return { wireflow, pages, components }
}
