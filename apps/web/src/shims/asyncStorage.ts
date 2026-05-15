type AsyncStorageShape = {
    getItem: (key: string) => Promise<string | null>
    setItem: (key: string, value: string) => Promise<void>
    removeItem: (key: string) => Promise<void>
}

const inMemoryStore = new Map<string, string>()

const AsyncStorage: AsyncStorageShape = {
    async getItem(key) {
        return inMemoryStore.has(key) ? inMemoryStore.get(key)! : null
    },
    async setItem(key, value) {
        inMemoryStore.set(key, value)
    },
    async removeItem(key) {
        inMemoryStore.delete(key)
    },
}

export default AsyncStorage
