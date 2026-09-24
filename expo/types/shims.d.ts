declare module 'hono';
declare module 'hono/cors';
declare module 'node-fetch';
declare module 'superjson';

// AsyncStorage minimal ambient typing for RN async-storage
declare module '@react-native-async-storage/async-storage' {
	const AsyncStorage: {
		getItem(key: string): Promise<string | null>;
		setItem(key: string, value: string): Promise<void>;
		removeItem(key: string): Promise<void>;
		multiRemove(keys: string[]): Promise<void>;
		getAllKeys(): Promise<string[]>;
	};
	export default AsyncStorage;
}
